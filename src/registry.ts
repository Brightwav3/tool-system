/**
 * Tool registry.
 *
 * Holds declarations and their implementations, and answers discovery. It does
 * not execute: keeping registration separate from execution means the set of
 * capabilities can be inspected — by an agent, by a test, by the CLI — without
 * the possibility of invoking one.
 */

import {
  toolError,
  validateDeclaration,
  type ExecutionArguments,
  type ExecutionOutcome,
  type ToolDeclaration,
  type ToolError,
} from "./contracts.js";

/**
 * What a tool receives. Deliberately narrow: no interface handle, no session,
 * no model client, no process primitives. Host effects arrive as injected
 * services so every one of them is observable and deniable.
 */
export interface ToolContext {
  readonly signal: AbortSignal;
  readonly requestId: string;
  readonly sessionId?: string;
  readonly services: ToolServices;
}

/** Injected host services. Extended as milestones add brokers. */
export interface ToolServices {
  readonly process?: ProcessBrokerLike;
}

/** Minimal broker shape the registry needs to know about; the implementation lands in Milestone 7. */
export interface ProcessBrokerLike {
  launch(executable: string, args: readonly string[], signal: AbortSignal): Promise<void>;
}

export type ToolHandler = (
  args: ExecutionArguments,
  context: ToolContext,
) => Promise<ExecutionOutcome>;

export interface RegisteredTool {
  readonly declaration: ToolDeclaration;
  readonly handler: ToolHandler;
}

export class ToolRegistry {
  readonly #tools = new Map<string, RegisteredTool>();

  /**
   * Registers a tool, returning a structured error rather than throwing so a
   * host can assemble a registry from many sources and report every failure
   * instead of dying on the first one.
   */
  register(declaration: ToolDeclaration, handler: ToolHandler): ToolError | null {
    const invalid = validateDeclaration(declaration);
    if (invalid !== null) {
      return invalid;
    }

    if (this.#tools.has(declaration.name)) {
      return toolError("duplicate_tool", "A tool with this name is already registered.", {
        tool: declaration.name,
      });
    }

    this.#tools.set(declaration.name, { declaration, handler });
    return null;
  }

  /** Every declaration, name-sorted so discovery output is stable across runs. */
  discover(): readonly ToolDeclaration[] {
    return [...this.#tools.values()]
      .map((entry) => entry.declaration)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  describe(name: string): ToolDeclaration | null {
    return this.#tools.get(name)?.declaration ?? null;
  }

  resolve(name: string): RegisteredTool | null {
    return this.#tools.get(name) ?? null;
  }

  get size(): number {
    return this.#tools.size;
  }
}
