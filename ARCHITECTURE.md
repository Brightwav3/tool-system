# Architecture

Tool System is an in-process, headless library with a JSON/JSONL diagnostic CLI. Its public boundary is a typed `ToolRuntime`; host effects stay behind injected services and never appear as direct imports inside a tool.

```text
Agent Runtime -> ToolRuntime -> validate -> bind context -> PolicyDecider
                                                                |
                                                          guards (timeout,
                                                          cancel, cooldown,
                                                          concurrency,
                                                          idempotency)
                                                                |
                                                          tool invoke
                                                                |
                                                     ProcessBroker / injected services
                                                                |
                                                     ExecutionOutcome -> trace
```

## Execution pipeline

Every execution passes the same six stages in order. A stage that rejects produces a typed outcome and no later stage runs, so no host effect can occur before validation and policy have both passed.

## Outcomes are a union, not a string

A tool returns one of `result`, `silent`, `continuation`, `lifecycle`, or `error`. `continuation` exists so a slow capability can acknowledge immediately and deliver its real answer on a later turn without the caller inventing a stalling convention. `silent` exists so a capability can succeed without producing anything to say. Collapsing these into one string field forces callers to parse prose to recover intent.

## The broker is the only path to the host

`ProcessBroker` accepts an argv array and an allowlisted executable. It has no shell-string entry point, so no argument value can reach a shell interpreter. Filesystem and network services follow the same rule. This gives one place where every side effect can be observed, denied, traced, and tested against a stub.

## Policy is consulted, never satisfied by the requester

`PolicyDecider.decide` returns `allow`, `deny(reason)`, or `requires_confirmation`. A confirmation requirement surfaces as an outcome to the caller's own caller; it is not a parameter the requester can set on a retry. Tool System owns the enforcement point and ships a deny-by-default allowlist; Security Core will own the decision logic and replace the implementation without a contract change.

## Taint marks origin, it does not filter

Results whose content derives from an external source carry a taint marker. Tool System does not decide what a consumer may do with tainted content — it guarantees the consumer can tell. Untrusted content and privileged capability must not share one undifferentiated channel.

## Context bindings are declared

A declaration may bind a parameter to a state key rather than requiring the caller to supply it. Binding resolution happens in the pipeline through a narrow State Core adapter, so implicit arguments are visible in the declaration instead of hidden in dispatch code.

## Identity and AI independence

No runtime contract, event name, header, or identifier embeds the assistant's name. Tool System has no model dependency: it validates, gates, executes, and reports. Reasoning about which tool to call belongs to Agent Runtime.
