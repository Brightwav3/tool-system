/**
 * Execution tracing.
 *
 * A trace records which stage an execution reached and how it ended. Recording
 * the stage — rather than only the final outcome — is what makes it possible to
 * answer "was this denied, or did it fail while running?", which is the question
 * that matters when auditing what a system actually did.
 *
 * Argument values are never recorded. Parameter names are enough to understand
 * a rejection, and values are the part most likely to be sensitive.
 */

import type { ExecutionOutcome, ToolErrorCode } from "./contracts.js";

export type ExecutionStage =
  | "resolve"
  | "validate"
  | "bind"
  | "policy"
  | "guard"
  | "invoke"
  | "complete";

export interface TraceEntry {
  readonly requestId: string;
  readonly tool: string;
  readonly stage: ExecutionStage;
  readonly outcomeKind: ExecutionOutcome["kind"];
  readonly errorCode?: ToolErrorCode;
  readonly durationMs: number;
  readonly parameters: readonly string[];
}

export interface TraceSink {
  record(entry: TraceEntry): void;
}

/** Retains a bounded window of recent entries. Diagnostics should not become a memory leak. */
export class InMemoryTraceSink implements TraceSink {
  readonly #entries: TraceEntry[] = [];
  readonly #limit: number;

  constructor(limit = 256) {
    this.#limit = limit;
  }

  record(entry: TraceEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) {
      this.#entries.shift();
    }
  }

  get entries(): readonly TraceEntry[] {
    return this.#entries;
  }

  clear(): void {
    this.#entries.length = 0;
  }
}
