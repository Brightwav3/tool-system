/**
 * Argument validation at the public boundary.
 *
 * Nothing downstream — policy, guards, the broker, the tool itself — may see an
 * argument that has not passed through here. Validating late means a host
 * effect can occur before anyone has checked what was asked for.
 */

import {
  toolError,
  type ExecutionArguments,
  type ParameterSchema,
  type ParameterValue,
  type ToolDeclaration,
  type ToolError,
} from "./contracts.js";

export interface ValidationSuccess {
  readonly ok: true;
  readonly args: ExecutionArguments;
}

export interface ValidationFailure {
  readonly ok: false;
  readonly error: ToolError;
}

export type ValidationOutput = ValidationSuccess | ValidationFailure;

function checkValue(
  tool: string,
  parameter: string,
  schema: ParameterSchema,
  value: unknown,
): ToolError | null {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        return toolError("invalid_arguments", "Parameter must be a string.", { tool, parameter });
      }
      if (schema.enum !== undefined && !schema.enum.includes(value)) {
        return toolError("invalid_arguments", "Parameter is not one of the permitted values.", {
          tool,
          parameter,
          permitted: schema.enum.join(", "),
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return toolError("invalid_arguments", "Parameter exceeds its maximum length.", {
          tool,
          parameter,
          maxLength: schema.maxLength,
        });
      }
      return null;
    }

    case "boolean": {
      return typeof value === "boolean"
        ? null
        : toolError("invalid_arguments", "Parameter must be a boolean.", { tool, parameter });
    }

    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return toolError("invalid_arguments", "Parameter must be a finite number.", {
          tool,
          parameter,
        });
      }
      if (schema.type === "integer" && !Number.isInteger(value)) {
        return toolError("invalid_arguments", "Parameter must be an integer.", { tool, parameter });
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        return toolError("invalid_arguments", "Parameter is below its minimum.", {
          tool,
          parameter,
          minimum: schema.minimum,
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return toolError("invalid_arguments", "Parameter is above its maximum.", {
          tool,
          parameter,
          maximum: schema.maximum,
        });
      }
      return null;
    }
  }
}

/**
 * Checks supplied arguments against a declaration.
 *
 * Undeclared arguments are rejected rather than ignored: silently dropping an
 * argument means a caller believes it constrained an execution that in fact ran
 * unconstrained. Absent optional parameters are simply absent — the tool sees
 * no key rather than an explicit undefined.
 */
export function validateArguments(
  declaration: ToolDeclaration,
  args: ExecutionArguments,
): ValidationOutput {
  const accepted: Record<string, ParameterValue> = {};

  for (const [parameter, value] of Object.entries(args)) {
    const schema = declaration.parameters[parameter];
    if (schema === undefined) {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Argument is not declared by this tool.", {
          tool: declaration.name,
          parameter,
        }),
      };
    }

    const error = checkValue(declaration.name, parameter, schema, value);
    if (error !== null) {
      return { ok: false, error };
    }

    accepted[parameter] = value;
  }

  for (const parameter of declaration.required) {
    const bound = declaration.bindings?.[parameter];
    if (!(parameter in accepted) && bound === undefined) {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Required argument is missing.", {
          tool: declaration.name,
          parameter,
        }),
      };
    }
  }

  return { ok: true, args: accepted };
}
