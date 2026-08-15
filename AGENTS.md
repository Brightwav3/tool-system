# Tool System — rules for agents

This file is loaded automatically. It carries rules, not description.
`README.md` says what this repository owns. `ARCHITECTURE.md` says how it is
shaped. [`docs/decisions/`](docs/decisions/README.md) says why — read it before
changing a boundary.

`AGENTS.md` is a byte-identical copy of this file. Change both or change neither.

## Ecosystem invariants that govern this repository

Quoted verbatim from [`INVARIANTS.md`](../INVARIANTS.md), which is the authority.
Do not paraphrase these sentences; a structure test compares them.

**INV-001 — Synchronous capabilities are declared in Host Tools**

> A capability that can produce its answer within the turn that requested it is
> declared in `host-tools` and executed by `tool-system`. It reaches the world
> only through an injected service, never through a direct import of a process,
> filesystem, network, or automation primitive.

Known exception: `src/tools/open-app.ts` is the single reference tool
demonstrating the declaration contract. **No second one is added.** A capability
intended for an assistant to call goes to `host-tools`, or through the Delegation
Broker if it cannot answer within its turn.

**INV-003 — Every host effect passes one brokered, deniable place**

> A capability never imports a spawn, filesystem, network, or automation
> primitive. Every effect on the world outside the process arrives through an
> injected service with an allowlist, and no service accepts a composed
> instruction — a shell string, a full URL — where it can accept parts.

## Rules in this repository

1. **Do not reorder the execution pipeline.** `resolve → validate → bind → policy
   → guards → invoke → classify` is a contract, not an implementation detail. The
   order is the security property. Adding a stage is allowed; reordering requires
   an ADR superseding [0001](docs/decisions/0001-pipeline-order-is-the-contract.md).
2. **Do not add a shell entry point to the broker**, and do not accept a composed
   path where a logical name will do. [ADR 0002](docs/decisions/0002-broker-is-the-only-host-path.md)
3. **Do not let a requester satisfy its own policy check.** `requires_confirmation`
   is an outcome, never a parameter. The shipped policy denies by default; keep it
   that way. `PermissivePolicy` is for tests and must never be a production
   default. [ADR 0003](docs/decisions/0003-policy-enforcement-point.md)
4. **Do not collapse `ExecutionOutcome` into a string or a boolean.** `silent`,
   `continuation`, and `lifecycle` are successes that callers handle differently.
   [ADR 0004](docs/decisions/0004-outcomes-are-a-union.md)
5. **Do not fill implicit arguments in during dispatch.** If a parameter comes
   from context, declare a binding for it. [ADR 0005](docs/decisions/0005-bindings-are-declared.md)
6. **No assistant name, model, or provider** appears in any runtime contract,
   event name, header, or identifier. Choosing *which* tool to call belongs to
   Agent Runtime, not here.

## Before you finish

- Changed a boundary, chose between two homes for something, or rejected an
  approach a next agent would try? Write an ADR. The six triggers and the
  template are in [../docs/decisions/README.md](../docs/decisions/README.md).
- Edited this file? Copy it to `AGENTS.md` in the same change. They must stay
  byte-identical — Claude Code reads one, Codex reads the other, and a structure
  test compares them.
- Wrote an ADR? Add its identifier as a comment in every file listed under its
  `Enforced in`.
- Reasoning belongs in `docs/decisions/`, not in `ARCHITECTURE.md`.
