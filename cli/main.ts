#!/usr/bin/env node
/**
 * Tool System diagnostic CLI.
 *
 * Machine-facing by default: every command emits a single JSON object on stdout
 * and signals success through the exit code. A human reading it is a secondary
 * consumer; an agent parsing it is the primary one.
 *
 * `execute` is deliberately gated by an explicit `--allow` flag. The CLI is a
 * diagnostic surface, and a diagnostic surface that launches host processes by
 * default is a way to bypass the policy the runtime exists to enforce.
 */

import { spawn } from "node:child_process";

import { CONTRACT_VERSION, PACKAGE_NAME } from "../src/index.js";
import { AllowlistProcessBroker, type BrokerLaunch } from "../src/broker.js";
import { AllowlistPolicy } from "../src/policy.js";
import { ToolRegistry } from "../src/registry.js";
import { ToolRuntime } from "../src/runtime.js";
import { openAppDeclaration, openAppHandler, type AppCatalog } from "../src/tools/open-app.js";
import { InMemoryTraceSink } from "../src/trace.js";

/**
 * Default catalog. Real deployments supply their own; this exists so the CLI
 * demonstrates a complete path without pretending to detect the host's
 * installed software.
 */
const CATALOG: AppCatalog = {
  browser: process.platform === "win32" ? "msedge" : "firefox",
  editor: process.platform === "win32" ? "notepad" : "gedit",
};

function detach(launch: BrokerLaunch): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.executable, [...launch.args], {
      detached: true,
      stdio: "ignore",
      shell: false, // The broker forbids shell strings; honour that here too.
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function buildRuntime(allowExecution: boolean): { runtime: ToolRuntime; trace: InMemoryTraceSink } {
  const registry = new ToolRegistry();
  registry.register(openAppDeclaration(CATALOG), openAppHandler(CATALOG));

  const trace = new InMemoryTraceSink();
  const runtime = new ToolRuntime({
    registry,
    policy: new AllowlistPolicy(allowExecution ? { allow: ["open_app"] } : {}),
    services: {
      process: new AllowlistProcessBroker({
        executables: Object.values(CATALOG),
        spawn: detach,
      }),
    },
    trace,
  });

  return { runtime, trace };
}

function emit(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main(argv: readonly string[]): Promise<number> {
  const [, , command, ...rest] = argv;
  const { runtime, trace } = buildRuntime(rest.includes("--allow"));
  await runtime.start();

  switch (command) {
    case "health": {
      emit({
        name: PACKAGE_NAME,
        contractVersion: CONTRACT_VERSION,
        status: "ok",
        tools: runtime.discover().length,
      });
      return 0;
    }

    case "capabilities": {
      emit({ tools: runtime.discover() });
      return 0;
    }

    case "describe": {
      const name = rest[0];
      const declaration = name === undefined ? null : runtime.describe(name);
      if (declaration === null) {
        emit({ error: { code: "unknown_tool", tool: name ?? null } });
        return 2;
      }
      emit(declaration);
      return 0;
    }

    case "execute": {
      const [tool, ...pairs] = rest.filter((token) => token !== "--allow");
      if (tool === undefined) {
        emit({ error: { code: "invalid_arguments", detail: "usage: execute <tool> [key=value ...] [--allow]" } });
        return 2;
      }

      const args: Record<string, string | number | boolean> = {};
      for (const pair of pairs) {
        const separator = pair.indexOf("=");
        if (separator < 1) {
          emit({ error: { code: "invalid_arguments", detail: `malformed argument: ${pair}` } });
          return 2;
        }
        const key = pair.slice(0, separator);
        const raw = pair.slice(separator + 1);
        args[key] = raw === "true" ? true : raw === "false" ? false : Number.isNaN(Number(raw)) || raw === "" ? raw : Number(raw);
      }

      const report = await runtime.execute({ tool, args });
      emit({ report, trace: trace.entries });
      return report.outcome.kind === "error" ? 1 : 0;
    }

    default: {
      emit({
        error: {
          code: "unknown_command",
          command: command ?? null,
          known: ["health", "capabilities", "describe", "execute"],
        },
      });
      return 2;
    }
  }
}

main(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (cause: unknown) => {
    emit({ error: { code: "cli_failed", cause: cause instanceof Error ? cause.name : "unknown" } });
    process.exitCode = 3;
  },
);
