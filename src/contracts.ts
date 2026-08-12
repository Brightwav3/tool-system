/**
 * Tool System contracts.
 *
 * Every type here crosses the public boundary. Consumers are expected to be
 * software agents, so shapes are explicit, discriminated, and machine-checkable
 * rather than convenient for prose.
 */

/* ------------------------------------------------------------------ *
 * Parameter schemas
 * ------------------------------------------------------------------ */

export type ParameterType = "string" | "integer" | "number" | "boolean";

/**
 * A single declared parameter. Constraints live in the declaration so a caller
 * can discover what is acceptable before attempting an execution, rather than
 * learning it from a rejection.
 */
export interface ParameterSchema {
  readonly type: ParameterType;
  readonly description: string;
  /** Permitted values for a string parameter. An empty list is invalid. */
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
}

export type ParameterValue = string | number | boolean;

export type ExecutionArguments = Readonly<Record<string, ParameterValue>>;

/* ------------------------------------------------------------------ *
 * Context bindings
 * ------------------------------------------------------------------ */

/**
 * Binds a parameter to a value the runtime resolves, so implicit arguments are
 * visible in the declaration instead of hidden inside dispatch code. A caller
 * may still supply the parameter explicitly; an explicit value wins.
 */
export interface ContextBinding {
  /** Namespaced key resolved through the context adapter, e.g. "session.activeFile". */
  readonly key: string;
  /** When false, an unresolved binding fails the execution instead of leaving the parameter absent. */
  readonly optional: boolean;
}

/* ------------------------------------------------------------------ *
 * Declarations
 * ------------------------------------------------------------------ */

/**
 * What a tool does to the world outside the process. Policy decides using this,
 * so it is declared rather than inferred from the implementation.
 */
export type SideEffectClass =
  | "read_only"
  | "local_state"
  | "process_launch"
  | "filesystem_write"
  | "network";

/**
 * Deterministic guards applied by the runtime, not requested of the caller.
 * A guard the requester can waive is not a guard.
 */
export interface GuardConfig {
  readonly timeoutMs: number;
  /** Simultaneous executions of this tool. Defaults to 1 — most host effects are not safely concurrent. */
  readonly maxConcurrent?: number;
  /** Minimum gap between executions, defeating duplicate calls caused by echo or model retries. */
  readonly cooldownMs?: number;
  /** When set, identical arguments within this window replay the prior outcome instead of re-executing. */
  readonly idempotencyWindowMs?: number;
}

export interface ToolDeclaration {
  /** Stable identifier. Callers address tools by name, so it may not change within a major version. */
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, ParameterSchema>>;
  readonly required: readonly string[];
  readonly bindings?: Readonly<Record<string, ContextBinding>>;
  readonly sideEffect: SideEffectClass;
  readonly guards: GuardConfig;
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

export interface ExecutionRequest {
  readonly tool: string;
  readonly args: ExecutionArguments;
  /** Caller-supplied identifier echoed into the outcome and the trace. */
  readonly requestId?: string;
}

/* ------------------------------------------------------------------ *
 * Taint
 * ------------------------------------------------------------------ */

/**
 * Where the content in an outcome came from. The runtime marks origin; it does
 * not decide what a consumer may do with it. Untrusted content and privileged
 * capability must not share one undifferentiated channel, and a consumer can
 * only apply its own trust rules if it can tell the difference.
 */
export type Taint = "trusted" | "external";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ToolErrorCode =
  | "unknown_tool"
  | "invalid_declaration"
  | "duplicate_tool"
  | "invalid_arguments"
  | "binding_unresolved"
  | "policy_denied"
  | "confirmation_required"
  | "cooldown_active"
  | "concurrency_limit"
  | "timeout"
  | "cancelled"
  | "broker_rejected"
  | "execution_failed"
  | "runtime_not_started";

/**
 * Structured failure. `retryable` distinguishes "this attempt failed" from
 * "this request will never succeed", which is the distinction a caller needs
 * and cannot recover from a message string.
 */
export interface ToolError {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  /** Non-sensitive detail: offending parameter names, limits, remaining cooldown. Never argument values. */
  readonly detail?: Readonly<Record<string, ParameterValue>>;
}

const RETRYABLE_CODES: ReadonlySet<ToolErrorCode> = new Set<ToolErrorCode>([
  "cooldown_active",
  "concurrency_limit",
  "timeout",
  "execution_failed",
]);

export function toolError(
  code: ToolErrorCode,
  message: string,
  detail?: Readonly<Record<string, ParameterValue>>,
): ToolError {
  return detail === undefined
    ? { code, message, retryable: RETRYABLE_CODES.has(code) }
    : { code, message, retryable: RETRYABLE_CODES.has(code), detail };
}

/* ------------------------------------------------------------------ *
 * Outcomes
 * ------------------------------------------------------------------ */

/** A capability produced content for the caller. */
export interface ResultOutcome {
  readonly kind: "result";
  readonly content: string;
  readonly taint: Taint;
}

/** The capability succeeded and has nothing to say. Distinct from an empty result. */
export interface SilentOutcome {
  readonly kind: "silent";
}

/**
 * The capability accepted the work and will deliver later. `acknowledgement`
 * is what the caller may surface now; `continuationId` correlates the eventual
 * delivery. Without this shape, slow capabilities force callers to invent
 * stalling conventions or sit silent while work runs.
 */
export interface ContinuationOutcome {
  readonly kind: "continuation";
  readonly continuationId: string;
  readonly acknowledgement: string;
}

/** The capability requests a runtime-level transition. The runtime does not act on it; the host decides. */
export interface LifecycleOutcome {
  readonly kind: "lifecycle";
  readonly action: "shutdown" | "restart";
  readonly reason: string;
}

export interface ErrorOutcome {
  readonly kind: "error";
  readonly error: ToolError;
}

export type ExecutionOutcome =
  | ResultOutcome
  | SilentOutcome
  | ContinuationOutcome
  | LifecycleOutcome
  | ErrorOutcome;

/** Outcome as returned to the caller, carrying correlation the runtime owns. */
export interface ExecutionReport {
  readonly tool: string;
  readonly requestId?: string;
  readonly outcome: ExecutionOutcome;
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ *
 * Declaration validation
 * ------------------------------------------------------------------ */

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const PARAMETER_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]{0,63}$/;

/**
 * Validates a declaration at registration time. A malformed declaration
 * discovered during execution would surface as a caller error for a fault the
 * tool author introduced, so it is rejected as early as possible.
 */
export function validateDeclaration(declaration: ToolDeclaration): ToolError | null {
  if (!TOOL_NAME_PATTERN.test(declaration.name)) {
    return toolError(
      "invalid_declaration",
      "Tool name must be lowercase alphanumeric with underscores, 2-64 characters.",
      { name: declaration.name },
    );
  }

  if (declaration.description.trim() === "") {
    return toolError("invalid_declaration", "Tool description must not be empty.", {
      name: declaration.name,
    });
  }

  if (declaration.guards.timeoutMs <= 0) {
    return toolError("invalid_declaration", "Guard timeoutMs must be positive.", {
      name: declaration.name,
      timeoutMs: declaration.guards.timeoutMs,
    });
  }

  if (declaration.guards.maxConcurrent !== undefined && declaration.guards.maxConcurrent < 1) {
    return toolError("invalid_declaration", "Guard maxConcurrent must be at least 1.", {
      name: declaration.name,
    });
  }

  for (const [parameter, schema] of Object.entries(declaration.parameters)) {
    if (!PARAMETER_NAME_PATTERN.test(parameter)) {
      return toolError("invalid_declaration", "Parameter name is not a valid identifier.", {
        name: declaration.name,
        parameter,
      });
    }

    if (schema.description.trim() === "") {
      return toolError("invalid_declaration", "Parameter description must not be empty.", {
        name: declaration.name,
        parameter,
      });
    }

    if (schema.enum !== undefined) {
      if (schema.type !== "string") {
        return toolError("invalid_declaration", "Parameter enum is only valid for string parameters.", {
          name: declaration.name,
          parameter,
        });
      }
      if (schema.enum.length === 0) {
        return toolError("invalid_declaration", "Parameter enum must not be empty.", {
          name: declaration.name,
          parameter,
        });
      }
    }

    if (
      schema.minimum !== undefined &&
      schema.maximum !== undefined &&
      schema.minimum > schema.maximum
    ) {
      return toolError("invalid_declaration", "Parameter minimum exceeds maximum.", {
        name: declaration.name,
        parameter,
      });
    }
  }

  for (const parameter of declaration.required) {
    if (!(parameter in declaration.parameters)) {
      return toolError("invalid_declaration", "Required parameter is not declared.", {
        name: declaration.name,
        parameter,
      });
    }
  }

  for (const parameter of Object.keys(declaration.bindings ?? {})) {
    if (!(parameter in declaration.parameters)) {
      return toolError("invalid_declaration", "Bound parameter is not declared.", {
        name: declaration.name,
        parameter,
      });
    }
  }

  return null;
}
