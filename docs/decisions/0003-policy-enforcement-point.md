# ADR 0003: Tool System owns where policy is consulted; it does not own what policy decides

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in `src/policy.ts`

## Context

Authorization is not yet a solved part of this system — Security Core does not
exist. The tempting response is to defer the whole subject and add a policy check
later, when there is something real to check with.

That ordering fails. An enforcement point added after the fact has to be threaded
through code written without it, and every capability written in the meantime is a
capability whose author did not have to think about permission. The decision
point and the decision logic are separable, and only one of them is blocked.

## Decision

`PolicyDecider.decide(query)` is consulted at a fixed point in the pipeline and
returns one of three results:

- `allow`
- `deny(reason)`
- `requires_confirmation(reason)`

Three properties follow, and each is load-bearing:

**Confirmation is an outcome, not a parameter.** `requires_confirmation` surfaces
to the caller's caller. It is deliberately not a field the requester can set on a
retry, because a gate the requester can satisfy alone is not a gate.

**The shipped policy denies by default.** `AllowlistPolicy` denies any tool not
explicitly listed, so registering a capability never silently grants it. Adding a
tool to the registry and permitting it are two separate acts.

**The decider is replaceable without a contract change.** Security Core will
supply the decision logic later. Until then the placeholder is intentionally
simple enough to reason about completely, and `PermissivePolicy` exists so tests
exercising something other than policy do not have to fight it.

## Rejected alternatives

### Defer policy until Security Core exists

Rejected. Every capability written before the enforcement point exists is one
written without a permission boundary, and retrofitting the call site into a
finished pipeline is harder than placing it in an empty one.

### Let a tool declare itself pre-authorized

Rejected. It relocates the decision to the party with the least standing to make
it, and it makes the permission surface a function of how each capability's author
felt about their own tool.

### Make confirmation a boolean argument the caller may pass

Rejected. This is the same failure in a different position: a requester that can
assert its own approval has not been gated.

### Permit by default and deny known-dangerous tools

Rejected. A denylist grants every capability nobody has thought about yet, which
is precisely the set most likely to contain something unexamined.

## Consequences

### Positive

- The permission boundary exists and is tested before any policy engine does.
- Security Core can replace the decider without touching the pipeline.
- `deny` and `requires_confirmation` carry reasons, so a refusal is diagnosable
  rather than merely a failure.

### Costs

- Every deployment must maintain an allowlist, and a forgotten entry presents as a
  denied tool rather than an obviously missing configuration.
- `PermissivePolicy` exists in the shipped package and must never become a
  production default.

## Enforced in

- `src/policy.ts`
- `src/runtime.ts`

## Explicit non-decisions

This ADR does not define the policy language, does not decide who answers a
confirmation or how it is presented, does not authorize per-caller identity or
roles, and does not govern taint handling, which marks origin rather than
permitting or refusing.
