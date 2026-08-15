/**
 * Reference tool: open_app.
 *
 * It exists to prove the contract carries a real capability end to end, and to
 * be the shape every later tool is written against.
 *
 * INV-001 — the documented exception. This is the *only* tool declared inside
 * Tool System. A capability an assistant calls goes to host-tools, or through
 * the Delegation Broker if it cannot answer within its turn. Do not add a
 * second reference tool here.
 * Ecosystem ADR 0001 — docs/decisions/0001-capability-homes.md
 *
 * Note what it does not do. It does not detect the platform, build a command
 * string, fall back to typing into a launcher, or import a spawn primitive. It
 * maps a declared application name to an allowlisted executable and asks the
 * broker to launch it. Everything else is somebody else's responsibility, which
 * is what keeps this file eleven lines of logic instead of six hundred.
 */

import type { ExecutionOutcome, ToolDeclaration } from "../contracts.js";
import { toolError } from "../contracts.js";
import type { ToolHandler } from "../registry.js";

/** Logical application name to the executable the broker must have allowlisted. */
export type AppCatalog = Readonly<Record<string, string>>;

export function openAppDeclaration(catalog: AppCatalog): ToolDeclaration {
  const apps = Object.keys(catalog).sort();

  return {
    name: "open_app",
    version: "0.1.0",
    description:
      "Launches a known application on the host. Only applications in the catalog can be launched.",
    parameters: {
      app: {
        type: "string",
        description: `Application to launch. One of: ${apps.join(", ")}.`,
        enum: apps,
      },
    },
    required: ["app"],
    sideEffect: "process_launch",
    guards: {
      timeoutMs: 10_000,
      maxConcurrent: 1,
      // A repeated request within two seconds is an echo or a model retry, not
      // a person wanting two copies of the same application.
      cooldownMs: 2_000,
    },
  };
}

export function openAppHandler(catalog: AppCatalog): ToolHandler {
  return async (args, context): Promise<ExecutionOutcome> => {
    const app = String(args.app);
    const executable = catalog[app];

    if (executable === undefined) {
      return {
        kind: "error",
        error: toolError("execution_failed", "Application is not in the catalog.", { app }),
      };
    }

    const broker = context.services.process;
    if (broker === undefined) {
      return {
        kind: "error",
        error: toolError("broker_rejected", "No process broker is available to this runtime."),
      };
    }

    await broker.launch(executable, [], context.signal);

    return { kind: "result", content: `Opened ${app}.`, taint: "trusted" };
  };
}
