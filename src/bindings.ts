/**
 * Context bindings.
 *
 * A binding lets a declaration say "this parameter comes from session state"
 * instead of the runtime quietly filling it in during dispatch. The difference
 * matters because an implicit argument that is visible in the declaration can be
 * discovered, audited, and tested; one hidden in dispatch code cannot.
 */

import {
  toolError,
  type ExecutionArguments,
  type ParameterValue,
  type ToolDeclaration,
  type ToolError,
} from "./contracts.js";

/**
 * Narrow read-only view of whatever holds current context — State Core in the
 * ecosystem, a map in a test. Tool System never reads state directly.
 */
export interface ContextProvider {
  get(key: string): ParameterValue | undefined | Promise<ParameterValue | undefined>;
}

export class MapContextProvider implements ContextProvider {
  readonly #values: ReadonlyMap<string, ParameterValue>;

  constructor(values: Readonly<Record<string, ParameterValue>> = {}) {
    this.#values = new Map(Object.entries(values));
  }

  get(key: string): ParameterValue | undefined {
    return this.#values.get(key);
  }
}

export type BindingOutput =
  | { readonly ok: true; readonly args: ExecutionArguments }
  | { readonly ok: false; readonly error: ToolError };

/**
 * Resolves declared bindings for parameters the caller did not supply.
 *
 * An explicit argument always wins: a binding is a default source, not an
 * override, so a caller can never be surprised by state replacing what it
 * actually asked for.
 */
export async function resolveBindings(
  declaration: ToolDeclaration,
  args: ExecutionArguments,
  context: ContextProvider | undefined,
): Promise<BindingOutput> {
  const bindings = declaration.bindings;
  if (bindings === undefined) {
    return { ok: true, args };
  }

  const resolved: Record<string, ParameterValue> = { ...args };

  for (const [parameter, binding] of Object.entries(bindings)) {
    if (parameter in resolved) {
      continue;
    }

    const value = context === undefined ? undefined : await context.get(binding.key);

    if (value === undefined) {
      if (binding.optional) {
        continue;
      }
      return {
        ok: false,
        error: toolError("binding_unresolved", "A required context binding could not be resolved.", {
          tool: declaration.name,
          parameter,
          key: binding.key,
        }),
      };
    }

    resolved[parameter] = value;
  }

  return { ok: true, args: resolved };
}
