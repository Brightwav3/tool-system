# ADR 0004: An execution outcome is a discriminated union, not a string with conventions

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in `src/contracts.ts`

## Context

The consumers of this boundary are software agents. A result shaped for prose —
one text field, with meaning carried by phrasing — forces every consumer to parse
sentences to recover intent, and forces every capability to invent its own phrasing
for situations the contract did not name.

Two situations in particular have no natural text representation:

- A capability that succeeds and has nothing to say. Returning empty text is
  indistinguishable from failing quietly.
- A capability too slow to answer in its turn. Holding the turn is what makes an
  assistant feel broken, and the alternative — each capability inventing its own
  stalling phrase — produces a different convention per tool.

## Decision

`ExecutionOutcome` is a discriminated union of five variants:

| Variant | Meaning |
| --- | --- |
| `result` | Succeeded, with content to deliver |
| `silent` | Succeeded, with nothing to say |
| `continuation` | Acknowledged now, real answer arrives on a later turn |
| `lifecycle` | Affected the session rather than the world |
| `error` | Did not succeed, with a typed `ToolErrorCode` |

Because `continuation` is declared in the contract, every slow capability gets the
same treatment without inventing a convention. `screen_capture` in `host-tools`
uses it: it starts the work and returns an acknowledgement plus an id.

Results whose content derives outside the host carry a **taint** marker, decided at
the source — `system_status` is `trusted`, `web_search` and `weather_report` are
`external`. Taint marks origin; it does not filter. Tool System does not decide
what a consumer may do with tainted content, only guarantees the consumer can tell.
Untrusted content and privileged capability must not share one undifferentiated
channel.

## Rejected alternatives

### One string field, with meaning in the phrasing

Rejected. It makes every consumer a parser of prose, and it makes a capability's
contract depend on wording that nobody can change safely afterwards.

### A result plus a boolean `success`

Rejected. It collapses `silent`, `continuation`, and `lifecycle` into either
success or failure, and all three are successes that a caller must handle
differently.

### Let each capability decide how to stall

Rejected. It produces one stalling convention per tool, none of them known to the
caller, and it moves a turn-taking decision into code that has no view of the turn.

### Have Tool System filter tainted content

Rejected. Filtering requires knowing what the consumer intends to do with the
content, which Tool System does not and should not know. Marking origin is a fact;
deciding consequence is a policy, and it belongs to the consumer.

## Consequences

### Positive

- Consumers switch on a discriminant instead of interpreting text.
- Slow capabilities are supported uniformly, and the turn stays with whoever owns
  it.
- Origin travels with content, so nothing downstream has to infer trust from a
  tool name.

### Costs

- Adding a variant is a breaking change for every consumer that switches
  exhaustively.
- Capability authors must classify their own taint correctly at the source; the
  runtime cannot check the claim.

## Enforced in

- `src/contracts.ts`
- `src/runtime.ts`

## Explicit non-decisions

This ADR does not define how a continuation's later result is delivered — that is
Assistant Runtime's — does not decide what a consumer must do with tainted
content, and does not fix the `ToolErrorCode` set as closed.
