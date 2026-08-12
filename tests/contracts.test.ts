import assert from "node:assert/strict";
import test from "node:test";

import {
  toolError,
  validateDeclaration,
  type ToolDeclaration,
} from "../src/contracts.js";

function declaration(overrides: Partial<ToolDeclaration> = {}): ToolDeclaration {
  return {
    name: "open_app",
    version: "0.1.0",
    description: "Launches a known application.",
    parameters: {
      app: { type: "string", description: "Application identifier." },
    },
    required: ["app"],
    sideEffect: "process_launch",
    guards: { timeoutMs: 5_000 },
    ...overrides,
  };
}

test("a well-formed declaration validates", () => {
  assert.equal(validateDeclaration(declaration()), null);
});

test("tool names are constrained so callers can address tools stably", () => {
  for (const name of ["Open_App", "open app", "1open", "o", "open-app"]) {
    const error = validateDeclaration(declaration({ name }));
    assert.equal(error?.code, "invalid_declaration", `expected rejection for ${name}`);
  }
});

test("a required parameter that is not declared is rejected", () => {
  const error = validateDeclaration(declaration({ required: ["app", "profile"] }));
  assert.equal(error?.code, "invalid_declaration");
  assert.equal(error?.detail?.parameter, "profile");
});

test("a binding on an undeclared parameter is rejected", () => {
  const error = validateDeclaration(
    declaration({ bindings: { missing: { key: "session.activeFile", optional: true } } }),
  );
  assert.equal(error?.code, "invalid_declaration");
  assert.equal(error?.detail?.parameter, "missing");
});

test("an empty enum is rejected because it permits nothing", () => {
  const error = validateDeclaration(
    declaration({ parameters: { app: { type: "string", description: "App.", enum: [] } } }),
  );
  assert.equal(error?.code, "invalid_declaration");
});

test("enum is rejected on a non-string parameter", () => {
  const error = validateDeclaration(
    declaration({
      parameters: { app: { type: "integer", description: "App.", enum: ["a"] } },
      required: [],
    }),
  );
  assert.equal(error?.code, "invalid_declaration");
});

test("an inverted numeric range is rejected", () => {
  const error = validateDeclaration(
    declaration({
      parameters: { app: { type: "integer", description: "App.", minimum: 10, maximum: 1 } },
      required: [],
    }),
  );
  assert.equal(error?.code, "invalid_declaration");
});

test("a non-positive timeout is rejected because a guard must actually bound execution", () => {
  assert.equal(validateDeclaration(declaration({ guards: { timeoutMs: 0 } }))?.code, "invalid_declaration");
});

test("empty descriptions are rejected on the tool and on parameters", () => {
  assert.equal(validateDeclaration(declaration({ description: "   " }))?.code, "invalid_declaration");
  assert.equal(
    validateDeclaration(
      declaration({ parameters: { app: { type: "string", description: "" } } }),
    )?.code,
    "invalid_declaration",
  );
});

test("error retryability is derived from the code, not chosen per call site", () => {
  assert.equal(toolError("timeout", "timed out").retryable, true);
  assert.equal(toolError("cooldown_active", "too soon").retryable, true);
  assert.equal(toolError("policy_denied", "denied").retryable, false);
  assert.equal(toolError("invalid_arguments", "bad args").retryable, false);
  assert.equal(toolError("unknown_tool", "no such tool").retryable, false);
});

test("error detail is omitted rather than set to undefined", () => {
  assert.equal("detail" in toolError("timeout", "timed out"), false);
  assert.deepEqual(toolError("timeout", "timed out", { tool: "open_app" }).detail, {
    tool: "open_app",
  });
});
