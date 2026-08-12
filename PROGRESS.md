# Progress

## Current state

COMPLETE — Tool System v0.1 is in MAINTENANCE mode.

## Completed

- Contracts: declarations, parameter schemas, context bindings, guard configuration, requests, the five-variant outcome union, taint, and structured errors with code-derived retryability.
- Registry: declaration validation at registration, duplicate rejection, name-sorted discovery, describe and resolve.
- Boundary validation: type, enum, range, length, undeclared-argument, and missing-required checks; values never appear in errors.
- Execution pipeline: `resolve → validate → bind → policy → guard → invoke → classify`, with rejection at any stage preventing every later stage.
- Guards: per-tool timeout, external cancellation, concurrency limit, cooldown with remaining time, and idempotent replay that excludes failures.
- Policy: `PolicyDecider` interface plus a deny-by-default `AllowlistPolicy`; confirmation is an outcome, never a caller-settable flag.
- Broker: `AllowlistProcessBroker` with argv-only launching, executable allowlisting, shell-metacharacter rejection, and no shell entry point.
- Bindings: declared parameters resolved from a narrow `ContextProvider`, with explicit arguments taking precedence.
- Tracing: stage-aware entries recording parameter names and never values, in a bounded window.
- Reference tool `open_app`, and a JSON CLI with `health`, `capabilities`, `describe`, and `execute`.

## Verification

- `npm run verify` — typecheck, 72 offline tests, build, compiled CLI health check. All pass.
- Identity independence: zero case-insensitive matches for `jarvis` across `src/`, `cli/`, `tests/`, and configuration.
- AI independence: zero runtime dependencies; three devDependencies, all build tooling.
- Execution surface: `child_process` is imported in exactly one file (`cli/main.ts`, the broker's injected spawn). No source file constructs a shell string.
- Security paths covered by test: policy denial never reaches the broker, a resubmitted `confirmed` flag is rejected as an undeclared argument, the broker refuses unlisted executables and metacharacter arguments, and neither errors nor traces carry argument values.

## Next milestone

Maintenance only: bugs, security fixes, compatibility, or required contract evolution.

## Known limitations

- `AllowlistPolicy` is a placeholder. Security Core will own decision logic and replace the decider; the `PolicyDecider` contract is the seam and needs no change.
- Confirmation is surfaced as an outcome; nothing in this repository grants it. The approving party is the consumer's responsibility.
- `ContinuationOutcome` defines the acknowledge-now-deliver-later shape but the delivery channel belongs to the consumer; Tool System correlates by id only.
- Tools are in-process modules registered at startup. Remote and plugin loading are out of scope by design.
- The CLI catalog is a demonstration mapping, not host software detection.

## Not yet decided

The repository is not a git repository and is not registered as a submodule of the meta-repository. Every neighboring core is a standalone repository added as a pinned submodule; this one must be initialized and wired the same way before its first commit.
