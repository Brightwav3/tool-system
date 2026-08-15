# Tool System decisions

Architecture Decision Records for choices contained within this repository.

A decision whose reasoning constrains code in another repository does not belong
here — it belongs in [the ecosystem decisions](../../../docs/decisions/README.md)
and, if it can be stated as a rule, in
[`INVARIANTS.md`](../../../INVARIANTS.md).

`ARCHITECTURE.md` describes **how this repository is shaped**. These records
describe **why**. Reasoning added to `ARCHITECTURE.md` instead of here is reasoning
nobody looks for, because an agent asking *why is this like this* opens a decision
record, not a diagram.

## Format

```
NNNN-slug.md          four digits, no gaps, no duplicates
```

Required sections: `Context`, `Decision`, `Rejected alternatives`,
`Consequences`, `Enforced in`, `Explicit non-decisions`.

Every path under `Enforced in` carries a comment at the declaration it constrains,
naming the ADR.

## Index

- [0001 — The execution pipeline's stage order is a contract](0001-pipeline-order-is-the-contract.md)
- [0002 — Host effects reach the world only through a brokered, allowlisted, argv-only path](0002-broker-is-the-only-host-path.md)
- [0003 — Tool System owns where policy is consulted, not what it decides](0003-policy-enforcement-point.md)
- [0004 — An execution outcome is a discriminated union](0004-outcomes-are-a-union.md)
- [0005 — An implicit argument is declared, not filled in by dispatch](0005-bindings-are-declared.md)
