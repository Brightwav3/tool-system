# ADR 0001: The execution pipeline's stage order is a contract, not an implementation detail

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in `src/runtime.ts`

## Context

`ToolRuntime.execute` runs every execution through the same stages:

```
resolve -> validate -> bind -> policy -> guards -> invoke -> classify
```

An agent optimising this code will see opportunities that look free: validating
after policy to avoid work on denied calls, resolving bindings lazily inside the
handler, running guards before validation because guards are cheap. Each of those
is a correctness regression, and none of them looks like one from inside the
function.

Two orderings in particular carry weight and are not obvious:

**Validation before policy.** Policy inspects the declaration and the arguments.
If arguments have not been validated, policy is judging values that may not match
their declared types or constraints, and a deny/allow decision made on unvalidated
input is not a decision about the execution that would actually run.

**Bindings before policy.** A declaration may bind a parameter to a context key
rather than requiring the caller to supply it. If policy ran first, it would judge
the subset of arguments the caller happened to type, and the handler would then
receive additional values policy never saw.

## Decision

The stage order is part of Tool System's public contract. A stage that rejects
produces a typed outcome and no later stage runs, so no host effect can occur
before validation and policy have both passed.

Changes to the order require an ADR superseding this one. Adding a stage is
permitted; reordering the existing ones is not, absent that ADR.

## Rejected alternatives

### Validate inside each handler

Rejected. It makes validation a matter of handler discipline, so the guarantee
holds only for handlers that remembered. Centralising it means a new capability
is validated correctly before its author has written anything.

### Let policy short-circuit before validation for speed

Rejected. The saving is a schema check on a denied call. The cost is that policy
decides on input nobody has checked, which turns a security boundary into a
heuristic.

### Resolve bindings lazily, inside the handler

Rejected. It reintroduces the implicit-argument problem that declared bindings
exist to remove, and it puts values in front of the handler that policy never
evaluated.

## Consequences

### Positive

- The security property is a property of one function, provable by reading it.
- Guards, tracing, and outcome classification apply uniformly to every capability
  without per-tool effort.
- A denied execution is observable at the stage it was denied, because the trace
  records the stage.

### Costs

- Every capability pays the full pipeline, including cheap ones like `calculate`.
- The runtime file is larger than a dispatch loop would be, and its size is not a
  signal that it should be split.

## Enforced in

- `src/runtime.ts`

## Explicit non-decisions

This ADR does not decide what policy permits, does not fix the guard set, does not
authorize a second execution path for "trusted" callers, and does not govern how
Assistant Runtime or Intelligence Core choose which tool to call.
