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

test("accounts for declared tools as a separate segment", () => {
  const report = analyzePayload({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Route through tools when needed." },
      { role: "user", content: "Inspect the workspace for failures." }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "searchWorkspace",
          description: "Search local files"
        }
      }
    ]
  });

  const toolSegment = report.segments.find((segment) => segment.type === "tool_schema");
  assert.ok(toolSegment);
  assert.equal(toolSegment?.label, "Declared tools");
  assert.equal(toolSegment?.reclaimability, "cache");
});

test("uses model overrides to compute budget headroom", () => {
  const report = analyzePayload({
    model: "claude-3-5-sonnet-latest",
    transcript: [
      { role: "system", content: "Stay concise." },
      { role: "user", content: "Inspect prompt occupancy." }
    ]
  });

  assert.equal(report.budget.contextWindow, 200000);
  assert.equal(report.budget.reservedOutput, 4096);
  assert.ok((report.budget.remainingInputHeadroom ?? 0) > 0);
});

test("diff matches segments by stable identity instead of array position", () => {
  const before = analyzePayload({
    model: "gpt-4o",
    transcript: [
      { role: "system", content: "Keep answers concise." },
      { role: "user", content: "Summarize the errors." },
      { role: "assistant", content: "The build failed on lint and tests." }
    ]
  });

  const after = analyzePayload({
    model: "gpt-4o",
    transcript: [
      { role: "system", content: "Keep answers concise." },
      { role: "developer", content: "Prefer terse diagnostics." },
      { role: "user", content: "Summarize the errors." },
      { role: "assistant", content: "The build failed on lint and tests." }
    ]
  });

  const diff = diffReports(before, after);
  assert.equal(diff.entries.length, 1);
  assert.equal(diff.entries[0]?.label, "developer turn 2");
  assert.equal(diff.entries[0]?.delta > 0, true);
});

test("structured content parts are split into attachment, retrieval_context, and tool_result segments", () => {
  const report = analyzePayload({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Summarize the attached notes." },
          { type: "input_image", image_url: "https://example.com/diagram.png" },
          { type: "document_chunk", text: "Relevant design excerpt." }
        ]
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", text: "{\"status\":\"ok\"}" }
        ]
      }
    ]
  });

  assert.ok(report.segments.some((segment) => segment.type === "attachment"));
  assert.ok(report.segments.some((segment) => segment.type === "retrieval_context"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
  assert.ok(report.segments.some((segment) => segment.label.includes("user message 1 part 1")));
});

test("analyzePayload accepts agent snapshots through the main analyzer entrypoint", () => {
  const report = analyzePayload({
    agents: [
      {
        id: "supervisor",
        model: "gpt-4o",
        payload: {
          model: "gpt-4o",
          messages: [
            { role: "system", content: "Coordinate workers." },
            { role: "user", content: "Inspect the repository." }
          ]
        }
      },
      {
        id: "worker-a",
        parentAgentId: "supervisor",
        model: "claude-3-5-sonnet-latest",
        payload: {
          anthropic_version: "2023-06-01",
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "Check parser behavior." }]
        }
      }
    ]
  });

  assert.equal(report.sourceType, "agent-snapshot");
  assert.equal(report.segments.filter((segment) => segment.type === "agent_metadata").length, 2);
  assert.ok(report.warnings.some((warning) => warning.includes("agent-report")));
});

test("analyzes OpenAI Responses payloads with instructions and structured input items", () => {
  const report = analyzePayload({
    model: "gpt-4.1",
    instructions: "You are a platform engineering assistant.",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Summarize the attached design." },
          { type: "input_image", image_url: "https://example.com/cluster.png" }
        ]
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: "{\"deployments\":4}"
      }
    ],
    usage: { input_tokens: 220 }
  });

  assert.equal(report.sourceType, "openai-responses");
  assert.ok(report.segments.some((segment) => segment.type === "developer"));
  assert.ok(report.segments.some((segment) => segment.type === "attachment"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
  assert.equal(report.totalInputTokens, 220);
});

test("analyzes Anthropic payloads with top-level system and tool blocks", () => {
  const report = analyzePayload({
    anthropic_version: "2023-06-01",
    model: "claude-3-7-sonnet-latest",
    system: [{ type: "text", text: "You are a careful SRE assistant." }],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_1", name: "search_logs", input: { query: "OOMKilled" } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "Found 3 events." }] }
        ]
      }
    ],
    usage: { input_tokens: 180 }
  });

  assert.equal(report.provider, "anthropic");
  assert.ok(report.segments.some((segment) => segment.type === "system"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_schema"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
});
