# Known Issues

- `PermissivePolicy` ships in the package. It exists so tests exercising something
  other than policy do not have to fight the allowlist, and it must never become a
  production default. There is currently no mechanism preventing that mistake — see
  [ADR 0003](docs/decisions/0003-policy-enforcement-point.md).

- Every deployment must maintain a policy allowlist. A forgotten entry presents as a
  denied tool rather than as an obviously missing configuration.

- `src/tools/open-app.ts` is the single reference tool declared inside the runtime
  that executes tools. It is a documented exception under `INV-001`, not a pattern.
  It is consumed by the diagnostic CLI and by Assistant Runtime's tests.

- Context binding keys are strings. A renamed state key fails at execution rather
  than at compile time.

- A capability needing an effect class with no broker cannot be written until the
  broker exists. This is intended, and it is why session-scoped stateful
  capabilities live in Assistant Runtime's delegation path.
