/**
 * Execution pipeline.
 *
 * Every execution passes the same stages in the same order:
 *
 *   resolve -> validate -> bind -> policy -> guards -> invoke -> classify
 *
 * A stage that rejects produces a typed outcome and no later stage runs, so no
 * host effect can occur before validation and policy have both passed. The
 * ordering is the security property; it is not an implementation detail.
 *
 * Bindings resolve before policy on purpose: policy must judge the arguments the
 * tool will actually receive, not the subset the caller happened to type.
 *
 * ADR 0001 — docs/decisions/0001-pipeline-order-is-the-contract.md
 * ADR 0003 — docs/decisions/0003-policy-enforcement-point.md
 * ADR 0004 — docs/decisions/0004-outcomes-are-a-union.md
 */

import { resolveBindings, type ContextProvider } from "./bindings.js";
import { BrokerRejection } from "./broker.js";
import {
  toolError,
  type ExecutionReport,
  type ExecutionRequest,
  type ExecutionOutcome,
  type ToolDeclaration,
} from "./contracts.js";
import { AllowlistPolicy, type PolicyDecider } from "./policy.js";
import { ToolRegistry, type ToolHandler, type ToolServices } from "./registry.js";
import type { ExecutionStage, TraceSink } from "./trace.js";
import { validateArguments } from "./validation.js";

export interface Clock {
  now(): number;
}

const systemClock: Clock = { now: () => Date.now() };

export interface ToolRuntimeOptions {
  readonly registry?: ToolRegistry;
  readonly policy?: PolicyDecider;
  readonly services?: ToolServices;
  readonly context?: ContextProvider;
  readonly trace?: TraceSink;
  readonly clock?: Clock;
}

interface GuardState {
  active: number;
  lastStartedAt: number;
  replay: Map<string, { at: number; outcome: ExecutionOutcome }>;
}

export class ToolRuntime {
  readonly #registry: ToolRegistry;
  readonly #policy: PolicyDecider;
  readonly #services: ToolServices;
  readonly #context: ContextProvider | undefined;
  readonly #trace: TraceSink | undefined;
  readonly #clock: Clock;
  readonly #guards = new Map<string, GuardState>();
  #started = false;
  #sequence = 0;

  constructor(options: ToolRuntimeOptions = {}) {
    this.#registry = options.registry ?? new ToolRegistry();
    this.#policy = options.policy ?? new AllowlistPolicy();
    this.#services = options.services ?? {};
    this.#context = options.context;
    this.#trace = options.trace;
    this.#clock = options.clock ?? systemClock;
  }

  get registry(): ToolRegistry {
    return this.#registry;
  }

  async start(): Promise<void> {
    this.#started = true;
  }

  /**
   * Stops accepting new executions. In-flight work is left to its own timeout
   * and cancellation rather than being abandoned, so a tool that holds a host
   * resource gets the chance to release it.
   */
  async stop(): Promise<void> {
    this.#started = false;
  }

  discover(): readonly ToolDeclaration[] {
    return this.#registry.discover();
  }

  describe(name: string): ToolDeclaration | null {
    return this.#registry.describe(name);
  }

  async execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionReport> {
    const startedAt = this.#clock.now();
    const requestId = request.requestId ?? `req-${++this.#sequence}`;

    const report = (
      outcome: ExecutionOutcome,
      stage: ExecutionStage,
      parameters: readonly string[],
    ): ExecutionReport => {
      const durationMs = Math.max(0, this.#clock.now() - startedAt);
      this.#trace?.record({
        requestId,
        tool: request.tool,
        stage,
        outcomeKind: outcome.kind,
        ...(outcome.kind === "error" ? { errorCode: outcome.error.code } : {}),
        durationMs,
        parameters,
      });
      return {
        tool: request.tool,
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
        outcome,
        durationMs,
      };
    };

    const supplied = Object.keys(request.args);

    if (!this.#started) {
      return report(
        {
          kind: "error",
          error: toolError("runtime_not_started", "The runtime is not accepting executions."),
        },
        "resolve",
        supplied,
      );
    }

    const registered = this.#registry.resolve(request.tool);
    if (registered === null) {
      return report(
        {
          kind: "error",
          error: toolError("unknown_tool", "No tool is registered under this name.", {
            tool: request.tool,
          }),
        },
        "resolve",
        supplied,
      );
    }

    const { declaration, handler } = registered;

    /* Stage 1 — validate ------------------------------------------------ */

    const validated = validateArguments(declaration, request.args);
    if (!validated.ok) {
      return report({ kind: "error", error: validated.error }, "validate", supplied);
    }

    /* Stage 2 — bind ---------------------------------------------------- */

    const bound = await resolveBindings(declaration, validated.args, this.#context);
    if (!bound.ok) {
      return report({ kind: "error", error: bound.error }, "bind", supplied);
    }

    const effective = bound.args;
    const parameters = Object.keys(effective);

    /* Stage 3 — policy -------------------------------------------------- */

    const decision = await this.#policy.decide({
      declaration,
      args: effective,
      requestId,
    });

    if (decision.kind === "deny") {
      return report(
        {
          kind: "error",
          error: toolError("policy_denied", decision.reason, { tool: declaration.name }),
        },
        "policy",
        parameters,
      );
    }

    if (decision.kind === "requires_confirmation") {
      return report(
        {
          kind: "error",
          error: toolError("confirmation_required", decision.reason, { tool: declaration.name }),
        },
        "policy",
        parameters,
      );
    }

    /* Stage 4 — guards -------------------------------------------------- */

    const guards = this.#guardState(declaration.name);
    const now = this.#clock.now();
    const { cooldownMs, maxConcurrent = 1, idempotencyWindowMs } = declaration.guards;
    const replayKey = JSON.stringify(effective);

    if (idempotencyWindowMs !== undefined) {
      const cached = guards.replay.get(replayKey);
      if (cached !== undefined && now - cached.at < idempotencyWindowMs) {
        return report(cached.outcome, "guard", parameters);
      }
    }

    if (cooldownMs !== undefined && guards.lastStartedAt > 0) {
      const elapsed = now - guards.lastStartedAt;
      if (elapsed < cooldownMs) {
        return report(
          {
            kind: "error",
            error: toolError("cooldown_active", "This tool was invoked too recently.", {
              tool: declaration.name,
              remainingMs: cooldownMs - elapsed,
            }),
          },
          "guard",
          parameters,
        );
      }
    }

    if (guards.active >= maxConcurrent) {
      return report(
        {
          kind: "error",
          error: toolError("concurrency_limit", "This tool is already running.", {
            tool: declaration.name,
            maxConcurrent,
          }),
        },
        "guard",
        parameters,
      );
    }

    /* Stage 5 — invoke -------------------------------------------------- */

    guards.active += 1;
    guards.lastStartedAt = now;

    try {
      const outcome = await this.#invoke(handler, declaration, effective, requestId, request.sessionId, signal);

      if (idempotencyWindowMs !== undefined && outcome.kind !== "error") {
        guards.replay.set(replayKey, { at: this.#clock.now(), outcome });
      }

      return report(outcome, outcome.kind === "error" ? "invoke" : "complete", parameters);
    } finally {
      guards.active -= 1;
    }
  }

  #guardState(tool: string): GuardState {
    const existing = this.#guards.get(tool);
    if (existing !== undefined) {
      return existing;
    }
    const created: GuardState = { active: 0, lastStartedAt: 0, replay: new Map() };
    this.#guards.set(tool, created);
    return created;
  }

  /**
   * Runs the handler under a timeout and the caller's cancellation signal.
   *
   * The timeout resolves the pipeline rather than the handler: a tool that
   * ignores its abort signal cannot hold the caller indefinitely. The handler
   * may still be running afterwards, which is why the signal is aborted too —
   * a cooperative tool gets the chance to stop.
   */
  async #invoke(
    handler: ToolHandler,
    declaration: ToolDeclaration,
    args: Readonly<Record<string, string | number | boolean>>,
    requestId: string,
    sessionId?: string,
    external?: AbortSignal,
  ): Promise<ExecutionOutcome> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    external?.addEventListener("abort", onExternalAbort, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (external?.aborted === true) {
        return { kind: "error", error: toolError("cancelled", "Cancelled before execution began.") };
      }

      const timeout = new Promise<ExecutionOutcome>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({
            kind: "error",
            error: toolError("timeout", "Execution exceeded its declared timeout.", {
              tool: declaration.name,
              timeoutMs: declaration.guards.timeoutMs,
            }),
          });
        }, declaration.guards.timeoutMs);
      });

      const invocation = handler(args, {
        signal: controller.signal,
        requestId,
        ...(sessionId ? { sessionId } : {}),
        services: this.#services,
      }).then(
        (outcome): ExecutionOutcome => outcome,
        (cause: unknown): ExecutionOutcome => {
          if (controller.signal.aborted && external?.aborted === true) {
            return { kind: "error", error: toolError("cancelled", "Execution was cancelled.") };
          }
          // A broker rejection is not a tool defect — it is the boundary doing
          // its job, and the caller needs to see that distinction.
          if (cause instanceof BrokerRejection) {
            return { kind: "error", error: cause.toolError };
          }
          return {
            kind: "error",
            error: toolError("execution_failed", "The tool raised an unhandled failure.", {
              tool: declaration.name,
              cause: cause instanceof Error ? cause.name : "unknown",
            }),
          };
        },
      );

      return await Promise.race([invocation, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      external?.removeEventListener("abort", onExternalAbort);
    }
  }
}
