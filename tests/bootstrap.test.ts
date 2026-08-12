import assert from "node:assert/strict";
import test from "node:test";

import { CONTRACT_VERSION, PACKAGE_NAME } from "../src/index.js";

test("package entry loads without a model, network, GUI, or neighboring core", () => {
  assert.equal(PACKAGE_NAME, "tool-system");
  assert.equal(CONTRACT_VERSION, "0.1.0");
});
