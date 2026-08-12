import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

async function cli(args: readonly string[]): Promise<{ code: number; json: any }> {
  try {
    const { stdout } = await run("node", ["--import", "tsx", "cli/main.ts", ...args]);
    return { code: 0, json: JSON.parse(stdout.trim()) };
  } catch (cause) {
    const error = cause as { code?: number; stdout?: string };
    return { code: error.code ?? -1, json: JSON.parse((error.stdout ?? "{}").trim()) };
  }
}

test("health reports machine-readable status and exits zero", async () => {
  const { code, json } = await cli(["health"]);
  assert.equal(code, 0);
  assert.equal(json.name, "tool-system");
  assert.equal(json.status, "ok");
  assert.equal(json.tools, 1);
});

test("capabilities exposes the full declaration so an agent need not guess parameters", async () => {
  const { code, json } = await cli(["capabilities"]);
  assert.equal(code, 0);
  assert.equal(json.tools[0].name, "open_app");
  assert.ok(Array.isArray(json.tools[0].parameters.app.enum));
  assert.equal(json.tools[0].guards.cooldownMs, 2_000);
});

test("describe returns a structured error and a non-zero code for an unknown tool", async () => {
  const { code, json } = await cli(["describe", "nope"]);
  assert.equal(code, 2);
  assert.equal(json.error.code, "unknown_tool");
});

test("an unknown command lists the known ones instead of failing opaquely", async () => {
  const { code, json } = await cli(["frobnicate"]);
  assert.equal(code, 2);
  assert.deepEqual(json.error.known, ["health", "capabilities", "describe", "execute"]);
});

test("execute is denied by default, so the diagnostic surface cannot bypass policy", async () => {
  const { code, json } = await cli(["execute", "open_app", "app=browser"]);
  assert.equal(code, 1);
  assert.equal(json.report.outcome.error.code, "policy_denied");
});

test("execute reports the trace alongside the outcome", async () => {
  const { json } = await cli(["execute", "open_app", "app=browser"]);
  assert.equal(json.trace[0].stage, "policy");
  assert.equal(json.trace[0].errorCode, "policy_denied");
});

test("execute validates arguments before policy even with --allow", async () => {
  const { code, json } = await cli(["execute", "open_app", "app=nonexistent", "--allow"]);
  assert.equal(code, 1);
  assert.equal(json.report.outcome.error.code, "invalid_arguments");
});

test("a malformed key=value pair is rejected", async () => {
  const { code, json } = await cli(["execute", "open_app", "app"]);
  assert.equal(code, 2);
  assert.equal(json.error.code, "invalid_arguments");
});
