/**
 * Process broker.
 *
 * The only path from a tool to a host process. Tools do not import a spawn
 * primitive, so every process launch in the system passes through one place
 * that can be observed, denied, traced, and stubbed in tests.
 *
 * There is deliberately no shell entry point. A shell string composed from an
 * argument means any value that reaches a tool can reach an interpreter; an
 * argv array cannot be reinterpreted that way regardless of its contents.
 */

import { toolError, type ToolError } from "./contracts.js";

export interface ProcessBroker {
  launch(executable: string, args: readonly string[], signal: AbortSignal): Promise<void>;
}

export interface BrokerLaunch {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface AllowlistBrokerConfig {
  /** Logical executable names this broker may launch. */
  readonly executables: readonly string[];
  /** Performs the actual launch. Injected so the pipeline is testable without touching the host. */
  readonly spawn: (launch: BrokerLaunch, signal: AbortSignal) => Promise<void>;
}

/** Characters that carry meaning to a shell. Rejected in arguments as defence in depth. */
const SHELL_METACHARACTERS = /[;&|`$><\n\r]/;

export class BrokerRejection extends Error {
  readonly toolError: ToolError;

  constructor(error: ToolError) {
    super(error.message);
    this.name = "BrokerRejection";
    this.toolError = error;
  }
}

/**
 * Launches only allowlisted executables, argv-only.
 *
 * The allowlist is checked against the logical name a tool asks for, not against
 * a path a tool constructs, so a tool cannot reach an arbitrary binary by
 * assembling a path to it.
 */
export class AllowlistProcessBroker implements ProcessBroker {
  readonly #executables: ReadonlySet<string>;
  readonly #spawn: AllowlistBrokerConfig["spawn"];
  readonly #launches: BrokerLaunch[] = [];

  constructor(config: AllowlistBrokerConfig) {
    this.#executables = new Set(config.executables);
    this.#spawn = config.spawn;
  }

  /** Every launch attempted, for assertions and diagnostics. */
  get launches(): readonly BrokerLaunch[] {
    return this.#launches;
  }

  async launch(executable: string, args: readonly string[], signal: AbortSignal): Promise<void> {
    if (!this.#executables.has(executable)) {
      throw new BrokerRejection(
        toolError("broker_rejected", "Executable is not permitted by the broker.", { executable }),
      );
    }

    for (const arg of args) {
      if (SHELL_METACHARACTERS.test(arg)) {
        throw new BrokerRejection(
          toolError("broker_rejected", "Argument contains shell metacharacters.", { executable }),
        );
      }
    }

    if (signal.aborted) {
      throw new BrokerRejection(toolError("cancelled", "Cancelled before launch."));
    }

    const launch: BrokerLaunch = { executable, args: [...args] };
    this.#launches.push(launch);
    await this.#spawn(launch, signal);
  }
}
