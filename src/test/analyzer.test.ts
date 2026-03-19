import test from "node:test";
import assert from "node:assert/strict";

import { analyzeAgentSnapshot, analyzePayload, diffReports } from "../index.js";

test("analyzes OpenAI-style payloads with provider usage", () => {
  const report = analyzePayload({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a focused coding assistant." },
      { role: "user", content: "Summarize the last two build failures." }
    ],
    tools: [{ type: "function", function: { name: "lookupLogs" } }],
    usage: { prompt_tokens: 120 }
  });

  assert.equal(report.provider, "openai");
  assert.equal(report.totalInputTokens, 120);
  assert.equal(report.totalConfidence, "exact");
  assert.ok(report.segments.some((segment) => segment.type === "provider_overhead"));
});

test("analyzes Anthropic message payloads without usage", () => {
  const report = analyzePayload({
    anthropic_version: "2023-06-01",
    model: "claude-3-5-sonnet-latest",
    messages: [
      { role: "user", content: "Review the retrieval chunks for duplication." },
      { role: "assistant", content: "I see three repeated blocks." }
    ]
  });

  assert.equal(report.provider, "anthropic");
  assert.equal(report.totalConfidence, "tokenizer-based");
  assert.equal(report.budget.risk, "low");
});

test("analyzes transcript payloads and diffs turns", () => {
  const before = analyzePayload({
    model: "gpt-4o",
    transcript: [
      { role: "system", content: "Keep answers concise." },
      { role: "user", content: "Summarize the errors." }
    ]
  });

  const after = analyzePayload({
    model: "gpt-4o",
    transcript: [
      { role: "system", content: "Keep answers concise." },
      { role: "user", content: "Summarize the errors." },
      { role: "assistant", content: "The build failed on lint and tests." }
    ]
  });

  const diff = diffReports(before, after);
  assert.equal(diff.totalDelta > 0, true);
  assert.ok(diff.entries.some((entry) => entry.label.includes("assistant")));
});

test("analyzes agent snapshots", () => {
  const summary = analyzeAgentSnapshot({
    agents: [
      {
        id: "planner",
        model: "gpt-4o",
        payload: {
          model: "gpt-4o",
          messages: [
            { role: "system", content: "Plan the work." },
            { role: "user", content: "Inspect the repo." }
          ]
        }
      },
      {
        id: "worker-1",
        parentAgentId: "planner",
        payload: {
          anthropic_version: "2023-06-01",
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "Implement the parser." }]
        }
      }
    ]
  });

  assert.equal(summary.agents.length, 2);
  assert.equal(summary.agents[1]?.parentAgentId, "planner");
  assert.ok((summary.agents[0]?.report?.totalInputTokens ?? 0) > 0);
});

test("rejects unsupported payload shapes", () => {
  assert.throws(() => analyzePayload({ foo: "bar" }), /Unsupported payload shape/);
});
