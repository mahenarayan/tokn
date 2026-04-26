import test from "node:test";
import assert from "node:assert/strict";

import { getModelLimit, listModelLimits } from "../index.js";

test("model registry lookups return defensive copies", () => {
  const first = getModelLimit("gpt-4o");
  assert.ok(first);

  first.contextWindow = 1;
  first.aliases?.push("mutated-alias");

  const second = getModelLimit("gpt-4o");
  assert.equal(second?.contextWindow, 128000);
  assert.ok(!second?.aliases?.includes("mutated-alias"));
});

test("model registry listings return defensive copies", () => {
  const listed = listModelLimits();
  assert.ok(listed.length > 0);

  const gpt4o = listed.find((limit) => limit.id === "gpt-4o");
  assert.ok(gpt4o);
  gpt4o.contextWindow = 1;
  gpt4o.aliases?.push("mutated-list-alias");

  const fresh = listModelLimits().find((limit) => limit.id === "gpt-4o");
  assert.equal(fresh?.contextWindow, 128000);
  assert.ok(!fresh?.aliases?.includes("mutated-list-alias"));
});
