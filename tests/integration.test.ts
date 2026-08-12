import assert from "node:assert/strict";
import test from "node:test";

import { MapContextProvider } from "../src/bindings.js";
import { AllowlistProcessBroker, type BrokerLaunch } from "../src/broker.js";
import type { ToolDeclaration } from "../src/contracts.js";
import { AllowlistPolicy, PermissivePolicy } from "../src/policy.js";
import { ToolRegistry } from "../src/registry.js";
import { ToolRuntime } from "../src/runtime.js";
import { openAppDeclaration, openAppHandler } from "../src/tools/open-app.js";
import { InMemoryTraceSink } from "../src/trace.js";

const CATALOG = { spotify: "spotify.exe", browser: "firefox" } as const;

function harness(options: { allow?: readonly string[]; confirm?: boolean } = {}) {
  const launched: BrokerLaunch[] = [];
  const broker = new AllowlistProcessBroker({
    executables: ["spotify.exe", "firefox"],
    spawn: async (launch) => {
      launched.push(launch);
    },
  });

  const registry = new ToolRegistry();
  assert.equal(
    registry.register(openAppDeclaration(CATALOG), openAppHandler(CATALOG)),
    null,
  );

  const trace = new InMemoryTraceSink();
  const runtime = new ToolRuntime({
    registry,
    policy: new AllowlistPolicy({
      allow: options.allow ?? ["open_app"],
      ...(options.confirm === true ? { confirm: ["process_launch" as const] } : {}),
    }),
    services: { process: broker },
    trace,
  });

  return { runtime, broker, launched, trace };
}

/* The capability, end to end ------------------------------------------- */

test("a permitted request launches the application through the broker", async () => {
  const { runtime, launched } = harness();
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });

  assert.equal(report.outcome.kind, "result");
  assert.equal(report.outcome.kind === "result" && report.outcome.content, "Opened spotify.");
  assert.deepEqual(launched, [{ executable: "spotify.exe", args: [] }]);
});

test("the tool is discoverable with its constraints before anyone executes it", async () => {
  const { runtime } = harness();
  await runtime.start();

  const [declaration] = runtime.discover();
  assert.equal(declaration?.name, "open_app");
  assert.equal(declaration?.sideEffect, "process_launch");
  assert.deepEqual(declaration?.parameters.app?.enum, ["browser", "spotify"]);
});

/* The boundary holds ---------------------------------------------------- */

test("a denied tool never reaches the broker", async () => {
  const { runtime, launched } = harness({ allow: [] });
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "policy_denied");
  assert.deepEqual(launched, []);
});

test("a confirmation requirement stops the launch and cannot be self-granted", async () => {
  const { runtime, launched } = harness({ confirm: true });
  await runtime.start();

  const first = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(first.outcome.kind === "error" && first.outcome.error.code, "confirmation_required");

  const retry = await runtime.execute({
    tool: "open_app",
    args: { app: "spotify", confirmed: true },
  });
  assert.equal(retry.outcome.kind === "error" && retry.outcome.error.code, "invalid_arguments");
  assert.deepEqual(launched, [], "no path through the pipeline reaches a launch");
});

test("an application outside the catalog is rejected by the schema, not by the tool", async () => {
  const { runtime, launched } = harness();
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: { app: "terminal" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "invalid_arguments");
  assert.deepEqual(launched, []);
});

test("the broker refuses an executable it was not given", async () => {
  const broker = new AllowlistProcessBroker({
    executables: ["firefox"],
    spawn: async () => {},
  });
  const registry = new ToolRegistry();
  registry.register(openAppDeclaration(CATALOG), openAppHandler(CATALOG));
  const runtime = new ToolRuntime({
    registry,
    policy: new PermissivePolicy(),
    services: { process: broker },
  });
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "broker_rejected");
});

test("the broker refuses arguments carrying shell metacharacters", async () => {
  const broker = new AllowlistProcessBroker({ executables: ["sh"], spawn: async () => {} });
  const controller = new AbortController();

  await assert.rejects(
    () => broker.launch("sh", ["file.txt; rm -rf /"], controller.signal),
    /shell metacharacters/i,
  );
  assert.deepEqual(broker.launches, []);
});

test("the broker has no shell entry point at all", () => {
  const broker = new AllowlistProcessBroker({ executables: ["sh"], spawn: async () => {} });
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(broker));
  assert.deepEqual(surface.filter((name) => name !== "constructor").sort(), ["launch", "launches"]);
});

/* Bindings -------------------------------------------------------------- */

test("a bound parameter is supplied from context when the caller omits it", async () => {
  const declaration: ToolDeclaration = {
    ...openAppDeclaration(CATALOG),
    bindings: { app: { key: "session.lastApp", optional: false } },
  };
  const registry = new ToolRegistry();
  registry.register(declaration, openAppHandler(CATALOG));

  const launched: BrokerLaunch[] = [];
  const runtime = new ToolRuntime({
    registry,
    policy: new PermissivePolicy(),
    services: {
      process: new AllowlistProcessBroker({
        executables: ["spotify.exe", "firefox"],
        spawn: async (launch) => {
          launched.push(launch);
        },
      }),
    },
    context: new MapContextProvider({ "session.lastApp": "browser" }),
  });
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: {} });
  assert.equal(report.outcome.kind, "result");
  assert.deepEqual(launched, [{ executable: "firefox", args: [] }]);
});

test("an explicit argument wins over its binding", async () => {
  const declaration: ToolDeclaration = {
    ...openAppDeclaration(CATALOG),
    bindings: { app: { key: "session.lastApp", optional: false } },
  };
  const registry = new ToolRegistry();
  registry.register(declaration, openAppHandler(CATALOG));

  const launched: BrokerLaunch[] = [];
  const runtime = new ToolRuntime({
    registry,
    policy: new PermissivePolicy(),
    services: {
      process: new AllowlistProcessBroker({
        executables: ["spotify.exe", "firefox"],
        spawn: async (launch) => {
          launched.push(launch);
        },
      }),
    },
    context: new MapContextProvider({ "session.lastApp": "browser" }),
  });
  await runtime.start();

  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  assert.deepEqual(launched, [{ executable: "spotify.exe", args: [] }]);
});

test("an unresolvable required binding fails before policy is consulted", async () => {
  const declaration: ToolDeclaration = {
    ...openAppDeclaration(CATALOG),
    bindings: { app: { key: "session.lastApp", optional: false } },
  };
  const registry = new ToolRegistry();
  registry.register(declaration, openAppHandler(CATALOG));

  let consulted = false;
  const runtime = new ToolRuntime({
    registry,
    policy: {
      decide() {
        consulted = true;
        return { kind: "allow" };
      },
    },
    context: new MapContextProvider({}),
  });
  await runtime.start();

  const report = await runtime.execute({ tool: "open_app", args: {} });
  assert.equal(report.outcome.kind === "error" && report.outcome.error.code, "binding_unresolved");
  assert.equal(consulted, false);
});

/* Tracing ---------------------------------------------------------------- */

test("the trace records the stage an execution reached, not only its outcome", async () => {
  const { runtime, trace } = harness({ allow: [] });
  await runtime.start();

  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });
  await runtime.execute({ tool: "open_app", args: { app: "terminal" } });
  await runtime.execute({ tool: "missing", args: {} });

  assert.deepEqual(
    trace.entries.map((entry) => `${entry.stage}:${entry.errorCode}`),
    ["policy:policy_denied", "validate:invalid_arguments", "resolve:unknown_tool"],
  );
});

test("a successful execution is traced as complete", async () => {
  const { runtime, trace } = harness();
  await runtime.start();

  await runtime.execute({ tool: "open_app", args: { app: "spotify" }, requestId: "r-1" });

  const [entry] = trace.entries;
  assert.equal(entry?.stage, "complete");
  assert.equal(entry?.outcomeKind, "result");
  assert.equal(entry?.requestId, "r-1");
  assert.deepEqual(entry?.parameters, ["app"]);
});

test("the trace records parameter names but never argument values", async () => {
  const { runtime, trace } = harness();
  await runtime.start();

  await runtime.execute({ tool: "open_app", args: { app: "spotify" } });

  const serialized = JSON.stringify(trace.entries);
  assert.equal(serialized.includes("app"), true, "parameter names are useful and not sensitive");
  assert.equal(serialized.includes("spotify"), false, "values must not be recorded");
});

test("the trace window is bounded so diagnostics cannot grow without limit", async () => {
  const trace = new InMemoryTraceSink(3);
  for (let index = 0; index < 10; index += 1) {
    trace.record({
      requestId: `r-${index}`,
      tool: "open_app",
      stage: "complete",
      outcomeKind: "silent",
      durationMs: 0,
      parameters: [],
    });
  }
  assert.equal(trace.entries.length, 3);
  assert.equal(trace.entries[0]?.requestId, "r-7");
});
