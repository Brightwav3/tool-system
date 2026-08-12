/**
 * Policy enforcement point.
 *
 * Tool System owns *where* policy is consulted; Security Core will own *what*
 * it decides. Separating the two means the enforcement point can be correct and
 * tested before any policy engine exists, and the engine can later replace the
 * decider without a contract change.
 */

import type { ExecutionArguments, SideEffectClass, ToolDeclaration } from "./contracts.js";

export interface PolicyQuery {
  readonly declaration: ToolDeclaration;
  readonly args: ExecutionArguments;
  readonly requestId: string;
}

export type PolicyDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  /**
   * The execution may proceed only after a party other than the requester
   * approves. This is returned to the caller's caller as an outcome; it is
   * deliberately not a parameter the requester can set on a retry, because a
   * gate the requester can satisfy alone is not a gate.
   */
  | { readonly kind: "requires_confirmation"; readonly reason: string };

export interface PolicyDecider {
  decide(query: PolicyQuery): PolicyDecision | Promise<PolicyDecision>;
}

export interface AllowlistPolicyConfig {
  /** Tool names permitted to run without confirmation. */
  readonly allow?: readonly string[];
  /** Side-effect classes that always require confirmation, whatever the allowlist says. */
  readonly confirm?: readonly SideEffectClass[];
}

/**
 * Deny-by-default policy.
 *
 * An unlisted tool is denied rather than permitted, so adding a capability to
 * the registry never silently grants it. This is the placeholder implementation
 * until Security Core exists; it is intentionally simple enough to reason about
 * completely.
 */
export class AllowlistPolicy implements PolicyDecider {
  readonly #allow: ReadonlySet<string>;
  readonly #confirm: ReadonlySet<SideEffectClass>;

  constructor(config: AllowlistPolicyConfig = {}) {
    this.#allow = new Set(config.allow ?? []);
    this.#confirm = new Set(config.confirm ?? []);
  }

  decide(query: PolicyQuery): PolicyDecision {
    const { name, sideEffect } = query.declaration;

    if (!this.#allow.has(name)) {
      return { kind: "deny", reason: `Tool '${name}' is not permitted by the active policy.` };
    }

    if (this.#confirm.has(sideEffect)) {
      return {
        kind: "requires_confirmation",
        reason: `Side effect '${sideEffect}' requires approval outside the requester.`,
      };
    }

    return { kind: "allow" };
  }
}

/** Permits everything. For tests that are exercising something other than policy. */
export class PermissivePolicy implements PolicyDecider {
  decide(): PolicyDecision {
    return { kind: "allow" };
  }
}
