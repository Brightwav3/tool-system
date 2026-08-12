import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDeclaration } from "../src/contracts.js";
import { ToolRegistry, type ToolHandler } from "../src/registry.js";
import { validateArguments } from "../src/validation.js";

const handler: ToolHandler = async () => ({ kind: "silent" });

function declaration(overrides: Partial<ToolDeclaration> = {}): ToolDeclaration {
  return {
    name: "open_app",
    version: "0.1.0",
    description: "Launches a known application.",
    parameters: {
      app: { type: "string", description: "Application identifier.", enum: ["spotify", "browser"] },
      retries: { type: "integer", description: "Attempts.", minimum: 0, maximum: 3 },
      force: { type: "boolean", description: "Bypass a running instance." },
      note: { type: "string", description: "Free text.", maxLength: 8 },
    },
    required: ["app"],
    sideEffect: "process_launch",
    guards: { timeoutMs: 5_000 },
    ...overrides,
  };
}

/* Registration -------------------------------------------------------- */

test("registration rejects an invalid declaration before it can be executed", () => {
  const registry = new ToolRegistry();
  const error = registry.register(declaration({ name: "Open App" }), handler);
  assert.equal(error?.code, "invalid_declaration");
  assert.equal(registry.size, 0);
});

test("a duplicate name is rejected so callers cannot address two tools by one identifier", () => {
  const registry = new ToolRegistry();
  assert.equal(registry.register(declaration(), handler), null);
  assert.equal(registry.register(declaration(), handler)?.code, "duplicate_tool");
  assert.equal(registry.size, 1);
});

test("registration returns an error instead of throwing, so a host can report every failure", () => {
  const registry = new ToolRegistry();
  const error = registry.register(declaration({ guards: { timeoutMs: -1 } }), handler);
  assert.equal(error?.code, "invalid_declaration");
});

/* Discovery ----------------------------------------------------------- */

test("discovery is name-sorted so agent-facing output is stable across runs", () => {
  const registry = new ToolRegistry();
  registry.register(declaration({ name: "web_search", required: [] }), handler);
  registry.register(declaration(), handler);
  registry.register(declaration({ name: "close_window", required: [] }), handler);

  assert.deepEqual(
    registry.discover().map((entry) => entry.name),
    ["close_window", "open_app", "web_search"],
  );
});

test("describe and resolve return null for an unknown tool rather than throwing", () => {
  const registry = new ToolRegistry();
  assert.equal(registry.describe("missing"), null);
  assert.equal(registry.resolve("missing"), null);
});

/* Argument validation -------------------------------------------------- */

test("valid arguments pass and are returned as accepted", () => {
  const output = validateArguments(declaration(), { app: "spotify", retries: 2 });
  assert.equal(output.ok, true);
  assert.deepEqual(output.ok ? output.args : null, { app: "spotify", retries: 2 });
});

test("an undeclared argument is rejected rather than silently dropped", () => {
  const output = validateArguments(declaration(), { app: "spotify", elevate: true });
  assert.equal(output.ok, false);
  assert.equal(output.ok ? null : output.error.detail?.parameter, "elevate");
});

test("a missing required argument is rejected", () => {
  const output = validateArguments(declaration(), { retries: 1 });
  assert.equal(output.ok, false);
  assert.equal(output.ok ? null : output.error.detail?.parameter, "app");
});

test("a required argument may be omitted when a binding will supply it", () => {
  const declared = declaration({
    bindings: { app: { key: "session.activeApp", optional: false } },
  });
  assert.equal(validateArguments(declared, {}).ok, true);
});

test("type mismatches are rejected for every parameter type", () => {
  const declared = declaration();
  assert.equal(validateArguments(declared, { app: 7 }).ok, false);
  assert.equal(validateArguments(declared, { app: "spotify", force: "yes" }).ok, false);
  assert.equal(validateArguments(declared, { app: "spotify", retries: "2" }).ok, false);
});

test("an integer parameter rejects a fractional value", () => {
  assert.equal(validateArguments(declaration(), { app: "spotify", retries: 1.5 }).ok, false);
});

test("numeric bounds are enforced in both directions", () => {
  assert.equal(validateArguments(declaration(), { app: "spotify", retries: -1 }).ok, false);
  assert.equal(validateArguments(declaration(), { app: "spotify", retries: 4 }).ok, false);
});

test("a value outside the declared enum is rejected", () => {
  const output = validateArguments(declaration(), { app: "terminal" });
  assert.equal(output.ok, false);
  assert.equal(output.ok ? null : output.error.code, "invalid_arguments");
});

test("maxLength is enforced on strings", () => {
  assert.equal(
    validateArguments(declaration(), { app: "spotify", note: "far too long to accept" }).ok,
    false,
  );
});

test("non-finite numbers are rejected", () => {
  assert.equal(validateArguments(declaration(), { app: "spotify", retries: NaN }).ok, false);
  assert.equal(
    validateArguments(declaration(), { app: "spotify", retries: Number.POSITIVE_INFINITY }).ok,
    false,
  );
});

test("validation errors never carry the offending value, only its parameter name", () => {
  const output = validateArguments(declaration(), { app: "secret-app-name" });
  assert.equal(output.ok, false);
  const serialized = JSON.stringify(output.ok ? {} : output.error);
  assert.equal(serialized.includes("secret-app-name"), false);
});
