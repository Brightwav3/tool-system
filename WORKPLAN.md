# Tool System v0.1 Workplan

## Goal

Build a headless, agent-first, model/provider/identity-independent runtime that turns declared capabilities into brokered, gated, observable executions.

## Core principle

Capabilities belong to the platform. A caller may request an execution; the Tool System decides how it is validated, gated, executed, and reported. A tool declares what it needs and what it returns; it never reaches the host directly.

## Scope

Tool declarations and typed parameter schemas; a registry with capability discovery; argument validation at the boundary; declared context bindings; typed execution results (`result`, `silent`, `continuation`, `lifecycle`); structured errors with a retryable/fatal taxonomy; per-tool concurrency, cooldown, and idempotency guards; timeouts and cancellation; a brokered process-execution service that tools must use instead of spawning directly; a policy decision hook with a deny-by-default allowlist; content taint marking on results derived from external sources; execution tracing; health, capabilities, and non-content metrics; a JSON/JSONL diagnostic CLI; and one reference tool, `open_app`.

## Non-goals

The model loop and iteration control (Agent Runtime), policy authoring and trust hierarchy (Security Core), prompt assembly (Intelligence Core), long-running work that outlives a conversation (Task Core), device or transport concerns (Device Network), scheduling (Task Core), a plugin marketplace or remote tool loading, GUI, and any generative-AI dependency.

## Boundaries

Agent Runtime is the primary consumer: it discovers tools, requests executions, and receives typed outcomes. Security Core will own policy; until it exists, Tool System exposes a `PolicyDecider` interface and ships a deny-by-default allowlist implementation that Security Core later replaces without contract change. Core Runtime may host the registry as a component and observe health without reaching storage internals. State Core supplies values for declared context bindings through a narrow adapter; Tool System never reads state directly. Tools are in-process modules registered at startup; they receive a scoped `ToolContext`, never a UI handle, a session, or a model client.

## Architecture

`ToolRegistry` holds `ToolDeclaration` records: stable name, version, typed parameter schema, required-argument set, declared context bindings, side-effect class, and guard configuration. `ToolRuntime` is the stable machine-facing contract: `discover()`, `describe(name)`, `execute(request, signal)`. Execution passes validate → bind context → policy decide → guard → invoke → classify outcome. Tools return a discriminated union rather than a string, so a slow capability can acknowledge immediately and deliver on a later turn. Host effects — process spawn, filesystem, network — are reached only through injected services, giving one observable, deniable, traceable point for every side effect. Results carrying externally sourced content are marked tainted so downstream consumers can apply their own trust rules. Runtime infrastructure must not embed the assistant name or any model/provider assumption.

## Contracts

`ToolDeclaration`, `ToolContext`, `ExecutionRequest`, `ExecutionOutcome` (`result | silent | continuation | lifecycle | error`), `ToolError` with a typed code and retryability, `PolicyDecider` with `decide(request) → allow | deny(reason) | requires_confirmation`, `ProcessBroker` with argv-only invocation, and `ContextBinding` resolution. All are validated at the public boundary.

## Security boundaries

No tool imports a process, filesystem, or network primitive directly; the broker is the only path and it rejects shell-string invocation outright. Policy is consulted before every execution and cannot be satisfied by the requester. Confirmation, when required, is returned to the caller as an outcome — it is never self-granted by resubmitting a flag. Arguments are validated against the declared schema before any host effect. Traces and logs redact argument values by default. Externally sourced content is marked, never silently promoted to instruction.

## Testing

Tests run offline, without an AI model, API key, network, hardware, GUI, or neighboring core. Cover declaration validation, schema rejection of malformed and extra arguments, context-binding resolution and absence, every outcome variant, the error taxonomy, timeout and cancellation, cooldown and concurrency guards, idempotency replay, policy allow/deny/confirm paths including the self-confirmation attempt, broker rejection of shell strings and of unregistered executables, taint propagation, trace completeness, health and capabilities, clean shutdown mid-execution, and the `open_app` tool against a stubbed broker.

## Milestones

1. Contracts: declarations, parameter schemas, requests, outcomes, errors.
2. Registry: registration, duplicate rejection, discovery, describe.
3. Validation: argument checking and structured rejection at the boundary.
4. Execution pipeline: invoke, classify outcome, propagate typed errors.
5. Guards: timeout, cancellation, per-tool concurrency, cooldown, idempotency.
6. `PolicyDecider` interface with a deny-by-default allowlist implementation.
7. `ProcessBroker`: argv-only spawn, allowlisted executables, no shell.
8. Context bindings and the narrow State Core adapter.
9. Taint marking and execution tracing.
10. `open_app` reference tool, health/capabilities/metrics, JSON/JSONL CLI, hardening audit.

## Definition of Done

A caller can discover the registered tools, execute `open_app` by name, and receive a typed outcome, with no GUI and no model present. Malformed arguments are rejected before any host effect. Every process execution passes through the broker, is argv-only, and appears in the trace. A denied execution cannot be forced by the requester, including by resubmitting a confirmation flag. Timeout and cancellation terminate an in-flight execution and leave the registry usable. Cooldown and idempotency guards hold under concurrent duplicate requests. Externally sourced content arrives marked. Structured errors, health, capabilities, metrics, automated tests, typecheck, build, documentation, and repository-hygiene audits all pass.

## Stop condition

When the Definition of Done is verified: `Tool System v0.1 — STATUS: COMPLETE — MODE: MAINTENANCE`. Do not extend into Agent Runtime's model loop, Security Core's policy authoring, Task Core's scheduling, a second reference tool, remote or plugin tool loading, or a GUI.
