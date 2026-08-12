import assert from "node:assert/strict";
import test from "node:test";

import type { GuardConfig, ToolDeclaration } from "../src/contracts.js";
import { AllowlistPolicy, PermissivePolicy, type PolicyDecider } from "../src/policy.js";
import { ToolRegistry, type ToolHandler } from "../src/registry.js";
import { ToolRuntime, type Clock } from "../src/runtime.js";

function declaration(guards: GuardConfig, overrides: Partial<ToolDeclaration> = {}): ToolDeclaration {
  return {
    name: "open_app",
    version: "0.1.0",
    description: "Launches a known application.",
    parameters: { app: { type: "string", description: "Application identifier." } },
    required: ["app"],
    sideEffect: "process_launch",
    guards,
    ...overrides,
  };
}

async function runtimeWith(
  handler: ToolHandler,
  guards: GuardConfig = { timeoutMs: 1_000 },
  policy: PolicyDecider = new PermissivePolicy(),
  overrides: Partial<ToolDeclaration> = {},
  clock?: Clock,
): Promise<ToolRuntime> {
  const registry = new ToolRegistry();
  assert.equal(registry.register(declaration(guards, overrides), handler), null);
  const runtime = new ToolRuntime({ registry, policy, ...(clock === undefined ? {} : { clock }) });
  await runtime.start();
  return runtime;
}

class ManualClock implements Clock {
  #now = 1_000;
  now(): number {
    return this.#now;
  }
  advance(ms: number): void {
    this.#now += ms;
  }
}

/* Pipeline ordering ---------------------------------------------------- */

test("an unstarted runtime refuses to execute", async () => {
  const registry = new ToolRegistry();
  registry.register(declaration({ timeoutMs: 100 }), async () => ({ kind: "silent" }));
  const runtime = new ToolRuntime({ registry, policy: new PermissivePolicy() });

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "runtime_not_started");
});

test("an unknown tool fails before any other stage runs", async () => {
  const runtime = await runtimeWith(async () => ({ kind: "silent" }));
  const report = await runtime.execute({ tool: "nope", args: {} });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "unknown_tool");
});

test("invalid arguments are rejected before policy is consulted", async () => {
  let consulted = false;
  const policy: PolicyDecider = {
    decide() {
      consulted = true;
      return { kind: "allow" };
    },
  };
  const runtime = await runtimeWith(async () => ({ kind: "silent" }), { timeoutMs: 100 }, policy);

  const report = await runtime.execute({ tool: "open_app", args: { app: 42 } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "invalid_arguments");
  assert.equal(consulted, false, "policy must not see arguments that failed validation");
});

test("a denied execution never reaches the handler", async () => {
  let invoked = false;
  const runtime = await runtimeWith(
    async () => {
      invoked = true;
      return { kind: "silent" };
    },
    { timeoutMs: 100 },
    new AllowlistPolicy(),
  );

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "policy_denied");
  assert.equal(invoked, false);
});

test("a denial cannot be overturned by resubmitting a confirmation flag", async () => {
  const runtime = await runtimeWith(
    async () => ({ kind: "silent" }),
    { timeoutMs: 100 },
    new AllowlistPolicy({ allow: ["open_app"], confirm: ["process_launch"] }),
  );

  const first = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(
    first.outcome.kind === "error" && first.outcome.error.code,
    "confirmation_required",
  );

  // The requester attempts to satisfy its own gate. The flag is not a declared
  // parameter, so it is rejected as an invalid argument — it can never become
  // an approval.
  const retry = await runtime.execute({
    tool: "open_app",
    args: { app: "spotify", confirmed: true },
  });
  assert.equal(retry.outcome.kind === "error" && retry.outcome.error.code, "invalid_arguments");
});

test("an allowed execution reaches the handler and returns its outcome", async () => {
  const runtime = await runtimeWith(
    async () => ({ kind: "result", content: "Opened.", taint: "trusted" }),
    { timeoutMs: 100 },
    new AllowlistPolicy({ allow: ["open_app"] }),
  );

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind, "result");
  assert.equal(report.outcome.kind === "result" && report.outcome.taint, "trusted");
});

/* Outcome variants ------------------------------------------------------ */

test("every outcome variant survives the pipeline intact", async () => {
  const variants = [
    { kind: "silent" as const },
    { kind: "result" as const, content: "text", taint: "external" as const },
    { kind: "continuation" as const, continuationId: "c-1", acknowledgement: "Looking now." },
    { kind: "lifecycle" as const, action: "shutdown" as const, reason: "requested" },
  ];

  for (const outcome of variants) {
    const runtime = await runtimeWith(async () => outcome);
    const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
    assert.deepEqual(report.outcome, outcome);
  }
});

test("a lifecycle outcome is reported, not acted upon by the runtime", async () => {
  const runtime = await runtimeWith(async () => ({
    kind: "lifecycle",
    action: "shutdown",
    reason: "user asked",
  }));

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind, "lifecycle");

  // The runtime is still usable: deciding to shut down belongs to the host.
  const again = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(again.outcome.kind, "lifecycle");
});

/* Failure paths --------------------------------------------------------- */

test("a handler that throws becomes a structured error, not a crash", async () => {
  const runtime = await runtimeWith(async () => {
    throw new TypeError("boom");
  });

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "execution_failed");
  assert.equal(report.outcome.kind === "error" && report.outcome.error.retryable, true);
});

test("an error never carries the thrown message, only the error class name", async () => {
  const runtime = await runtimeWith(async () => {
    throw new Error("password=hunter2");
  });

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(JSON.stringify(report.outcome).includes("hunter2"), false);
});

test("a handler exceeding its timeout resolves as a timeout and aborts the signal", async () => {
  let sawAbort = false;
  const runtime = await runtimeWith(
    (_args, context) =>
      new Promise((resolve) => {
        context.signal.addEventListener("abort", () => {
          sawAbort = true;
          resolve({ kind: "silent" });
        });
      }),
    { timeoutMs: 20 },
  );

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "timeout");
  assert.equal(sawAbort, true, "a cooperative tool must be told to stop");
});

test("the runtime stays usable after a timeout", async () => {
  const runtime = await runtimeWith(
    async (args) => (args.app === "slow" ? new Promise(() => {}) : { kind: "silent" }),
    { timeoutMs: 20, maxConcurrent: 2 },
  );

  const slow = await runtime.execute({ tool: "open_app", args: { app: "slow" } });
  assert.equal(slow.outcome.kind === "error" && slow.outcome.error.code, "timeout");

  const fast = await runtime.execute({ tool: "open_app", args: { app: "fast" } });
  assert.equal(fast.outcome.kind, "silent");
});

test("cancellation before execution is reported without invoking the handler", async () => {
  let invoked = false;
  const runtime = await runtimeWith(async () => {
    invoked = true;
    return { kind: "silent" };
  });

  const controller = new AbortController();
  controller.abort();
  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } }, controller.signal);

  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "cancelled");
  assert.equal(invoked, false);
});

test("cancellation mid-execution propagates to the handler signal", async () => {
  const runtime = await runtimeWith(
    (_args, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    { timeoutMs: 5_000 },
  );

  const controller = new AbortController();
  const pending = runtime.execute({ tool: "open_app", args: { app: "spotify" } }, controller.signal);
  controller.abort();

  const report = await pending;
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "cancelled");
});

/* Guards ---------------------------------------------------------------- */

test("concurrent duplicates are rejected rather than queued", async () => {
  let release: (() => void) | undefined;
  const runtime = await runtimeWith(
    () => new Promise((resolve) => {
      release = () => resolve({ kind: "silent" });
    }),
    { timeoutMs: 5_000, maxConcurrent: 1 },
  );

  const first = runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  const second = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });

  assert.equal(second.outcome.kind === "error" && second.outcome.error.code, "concurrency_limit");
  release?.();
  assert.equal((await first).outcome.kind, "silent");
});

test("a cooldown rejects a rapid second call and reports the remaining time", async () => {
  const clock = new ManualClock();
  const runtime = await runtimeWith(
    async () => ({ kind: "silent" }),
    { timeoutMs: 1_000, cooldownMs: 4_000 },
    new PermissivePolicy(),
    {},
    clock,
  );

  assert.equal((await runtime.execute({ tool: "open_app", args: { app: "a" } })).outcome.kind, "silent");

  clock.advance(1_000);
  const blocked = await runtime.execute({ tool: "open_app", args: { app: "a" } });
  assert.equal(blocked.outcome.kind === "error" && blocked.outcome.error.code, "cooldown_active");
  assert.equal(blocked.outcome.kind === "error" && blocked.outcome.error.detail?.remainingMs, 3_000);

  clock.advance(4_000);
  assert.equal((await runtime.execute({ tool: "open_app", args: { app: "a" } })).outcome.kind, "silent");
});

test("identical arguments within the idempotency window replay instead of re-executing", async () => {
  const clock = new ManualClock();
  let invocations = 0;
  const runtime = await runtimeWith(
    async () => {
      invocations += 1;
      return { kind: "result", content: `run-${invocations}`, taint: "trusted" };
    },
    { timeoutMs: 1_000, idempotencyWindowMs: 5_000 },
    new PermissivePolicy(),
    {},
    clock,
  );

  const first = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  const replay = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });

  assert.deepEqual(replay.outcome, first.outcome);
  assert.equal(invocations, 1);

  // Different arguments are a different execution.
  await runtime.execute({ tool: "open_app", args: { app: "browser" } });
  assert.equal(invocations, 2);

  // Past the window, the same arguments execute again.
  clock.advance(6_000);
  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(invocations, 3);
});

test("a failed execution is not cached for replay", async () => {
  const clock = new ManualClock();
  let invocations = 0;
  const runtime = await runtimeWith(
    async () => {
      invocations += 1;
      throw new Error("transient");
    },
    { timeoutMs: 1_000, idempotencyWindowMs: 5_000 },
    new PermissivePolicy(),
    {},
    clock,
  );

  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(invocations, 2, "a retryable failure must not be replayed as an outcome");
});

/* Reporting -------------------------------------------------------------- */

test("the report echoes the caller's request id and omits it when absent", async () => {
  const runtime = await runtimeWith(async () => ({ kind: "silent" }));

  const withId = await runtime.execute({
    tool: "open_app",
    args: { app: "spotify" },
    requestId: "abc",
  });
  assert.equal(withId.requestId, "abc");

  const withoutId = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal("requestId" in withoutId, false);
});

test("discovery is available through the runtime without executing anything", async () => {
  const runtime = await runtimeWith(async () => ({ kind: "silent" }));
  assert.deepEqual(runtime.discover().map((entry) => entry.name), ["open_app"]);
  assert.equal(runtime.describe("open_app")?.sideEffect, "process_launch");
  assert.equal(runtime.describe("missing"), null);
});

test("a stopped runtime refuses new executions", async () => {
  const runtime = await runtimeWith(async () => ({ kind: "silent" }));
  await runtime.stop();

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "runtime_not_started");
});
