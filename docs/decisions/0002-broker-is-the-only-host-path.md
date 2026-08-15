# ADR 0002: Host effects reach the world only through a brokered, allowlisted, argv-only path

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in `src/broker.ts`

## Context

A tool that can launch a process is a tool that can do anything the host can do.
The question is not whether to allow it — an assistant that cannot act is not an
assistant — but where the ability is concentrated.

Two failure shapes drove this:

1. **A tool importing a spawn primitive directly.** The capability then has an
   effect that no test can stub, no trace can record, and no policy can deny,
   because the effect does not pass through anything that could refuse it.
2. **A shell string composed from an argument.** Any value that reaches the tool
   can then reach an interpreter. This is not a matter of escaping carefully; it
   is a matter of the argument and the instruction sharing one channel.

## Decision

`ProcessBroker.launch(executable, args, signal)` is the only path from a tool to a
host process. It takes an argv array and a logical executable name.

- There is **no shell entry point**. An argv array cannot be reinterpreted as an
  instruction regardless of its contents.
- The allowlist is checked against the **logical name the tool asks for**, not
  against a path the tool constructs, so a tool cannot reach an arbitrary binary
  by assembling a path to it.
- Arguments containing shell metacharacters are rejected as defence in depth, even
  though no shell is involved.
- `spawn` is injected, so the whole pipeline is exercisable without touching the
  host.

Network access follows the same shape in `host-tools`: `HttpBroker.get(host, path)`
takes parts, never a composed URL. The caller supplies pieces; the broker
composes.

## Rejected alternatives

### Allow a shell string for convenience on Windows

Rejected. Windows launcher behaviour is the most common reason to reach for a
shell, and it is exactly the case where an argument value most often contains
something the shell will interpret. The convenience is real and is not worth the
channel.

### Allowlist executable paths instead of logical names

Rejected. A path is a value a tool can construct. A logical name is one the tool
must have been given, which is the difference between an allowlist and a
suggestion.

### Trust argument validation to make a shell safe

Rejected. It makes safety depend on every future schema being written correctly,
rather than on the absence of an interpreter.

## Consequences

### Positive

- One observable, deniable, traceable place per effect class.
- Every capability is testable against a stub broker, with no host required.
- The "no direct host access" rule is checkable by reading imports rather than by
  tracing calls.

### Costs

- A capability needing an effect class that has no broker cannot be written until
  the broker exists. This is intended, and it is the reason Host Tools cannot
  currently serve stateful, session-scoped capabilities — see
  [ecosystem ADR 0001](../../../docs/decisions/0001-capability-homes.md).
- Launch failures surface as broker rejections rather than native errors, so
  diagnostics read one level removed from the operating system.

## Enforced in

- `src/broker.ts`
- `src/registry.ts`

## Explicit non-decisions

This ADR does not decide which executables are allowlisted in any deployment, does
not authorize a filesystem-write broker, does not govern how `host-tools`
implements its own services beyond the parts-not-instructions rule, and does not
rule on sandboxing or process isolation.
