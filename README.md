# Tool System

[![CI](https://github.com/Brightwav3/tool-system/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Brightwav3/tool-system/actions/workflows/ci.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Assistant Mark I](https://img.shields.io/badge/Part%20of-Assistant%20Mark%20I-6f42c1)](https://github.com/Brightwav3/Assistant-mark-I)

Headless, agent-first, model-independent runtime that turns declared capabilities into brokered, policy-gated, observable executions.

## Owns

- Typed tool declarations, a registry with capability discovery, and boundary validation of arguments.
- Typed execution outcomes (`result`, `silent`, `continuation`, `lifecycle`, `error`), structured errors, timeouts, and cancellation.
- Per-tool concurrency, cooldown, and idempotency guards.
- A brokered process-execution service that is the only path to host effects, and a policy decision hook consulted before every execution.
- Content taint marking, execution tracing, health, capabilities, metrics, a JSON CLI, and one reference tool.

## Does not own

- The model loop and iteration control (Agent Runtime), policy authoring (Security Core), prompt assembly (Intelligence Core), scheduling (Task Core), device transport (Device Network), remote or plugin tool loading, or a GUI.

## Status

Tool System v0.1 is complete. It runs entirely in-process and headlessly, with one reference tool and no runtime dependencies. See [PROGRESS.md](./PROGRESS.md).

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run verify
```

## Runtime API

```ts
const registry = new ToolRegistry();
registry.register(openAppDeclaration(catalog), openAppHandler(catalog));

const runtime = new ToolRuntime({
  registry,
  policy: new AllowlistPolicy({ allow: ["open_app"] }),
  services: { process: new AllowlistProcessBroker({ executables, spawn }) },
  trace: new InMemoryTraceSink(),
});
await runtime.start();

const report = await runtime.execute({
  tool: "open_app",
  args: { app: "spotify" },
  sessionId: "live-session-1", // optional host correlation
}, signal);

if (report.outcome.kind === "error") {
  report.outcome.error.code;      // typed, never a prose string
  report.outcome.error.retryable; // "this attempt failed" vs "this will never succeed"
}
```

A caller may request an execution. It cannot grant itself one: a denied request returns `policy_denied`, and a request needing approval returns `confirmation_required` — an outcome to escalate, never a flag the requester can resubmit.

Realtime host adapters may attach an optional `sessionId` to an execution
request. Tool handlers receive the same value through `ToolContext`, which lets
the host correlate side effects, evidence, and traces with a live conversation.
Tool System treats it as caller-supplied context; it does not interpret or
persist the session identity.

## CLI

```sh
tool-system health
tool-system capabilities
tool-system describe open_app
tool-system execute open_app app=browser --allow
```

Every command emits one JSON object and signals through the exit code. `execute` is denied unless `--allow` is passed, because a diagnostic surface that launches host processes by default is a way around the policy the runtime exists to enforce.

## Relationship to the ecosystem

Agent Runtime is the primary consumer. Security Core will replace the default deny-by-default `PolicyDecider` without a contract change. State Core supplies declared context bindings through a narrow adapter. Core Runtime may host the registry as a component and observe its health.

Part of [Assistant mark I](../README.md).
