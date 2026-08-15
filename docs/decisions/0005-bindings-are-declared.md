# ADR 0005: An implicit argument is declared in the tool, not filled in by dispatch

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in `src/bindings.ts`

## Context

Some parameters should not come from the caller. A session id supplied by a model
is a session id the model can change, and a model that can name a session can read
a conversation that is not its own. The same holds for an active file, a device
id, or any other value that identifies *which* context the execution belongs to.

The usual solution is to fill such values in during dispatch: the runtime knows
the session, so it adds it on the way through. That works and is invisible. The
parameter does not appear in the declaration, so nothing that reads declarations —
an agent choosing a tool, a test, the CLI, an auditor — can see that the execution
receives it.

## Decision

A declaration may bind a parameter to a context key:

```ts
bindings: { app: { key: "session.lastApp", optional: false } }
```

Resolution happens in the pipeline, through a narrow `ContextProvider` that
exposes only `get(key)`. Tool System never reads state directly; State Core sits
behind that interface in the ecosystem and a plain map sits behind it in tests.

Three rules follow:

- **An explicit value from the caller wins.** A binding is a default source, not
  an override, so a caller that legitimately knows the value is not fought.
- **A non-optional binding that fails to resolve fails the execution.** Leaving the
  parameter absent would hand the handler a silently incomplete call.
- **Bindings resolve before policy.** Policy must judge the arguments the tool will
  actually receive. See [ADR 0001](0001-pipeline-order-is-the-contract.md).

## Rejected alternatives

### Fill implicit values in during dispatch

Rejected. The value still reaches the handler, but nothing that reads the
declaration can discover it. An implicit argument that is visible can be audited
and tested; one hidden in dispatch code cannot.

### Require the caller to pass everything

Rejected. It puts session and device identity in the hands of a model, which is
the case this decision exists to prevent.

### Give tools a context handle instead of bound parameters

Rejected. A handle is an open-ended capability: a tool holding it can read any key,
and what it reads is invisible in the declaration. A named binding is a stated,
minimal dependency.

## Consequences

### Positive

- A tool's real input is fully described by its declaration.
- Session-scoped values cannot be chosen by a model.
- The context dependency is a one-method interface, so tests need no state runtime.

### Costs

- Binding keys are strings, and a renamed key fails at execution rather than at
  compile time.
- Two sources for one parameter means the precedence rule must be remembered when
  debugging an unexpected value.

## Enforced in

- `src/bindings.ts`
- `src/contracts.ts`

## Explicit non-decisions

This ADR does not define the context key namespace, does not authorize writes
through the context provider, and does not decide how Assistant Runtime scopes a
session — it only requires that the scoping value not come from the model.
