# Title

OpenAI-Compatible Request Logs V1

## Problem

Many LLM gateways, proxies, and wrappers persist request logs that are close to OpenAI chat or responses payloads, but not identical.
Tokn already handles several direct provider shapes, yet there is still a gap between "saved provider payload" and "log object emitted by a wrapper or gateway."

To improve real field usage, Tokn should support a conservative adapter for OpenAI-compatible request logs before expanding to more ecosystem-specific formats.

## Goals

- support static OpenAI-compatible request log objects as input to `inspect`
- normalize common wrapper fields without requiring a live dependency on the wrapper
- preserve the existing segment taxonomy and confidence model
- stay conservative when logs omit exact usage totals or store request bodies under wrapper-specific keys

## Non-Goals

- live integration with a specific gateway or proxy
- full compatibility with every OpenAI-compatible product in one pass
- response-log or streaming-event reconstruction in v1
- mutating logs or calling external services

## Inputs

Support log objects that wrap OpenAI-style payloads under common fields such as:

- `request`
- `request_body`
- `body`
- `payload`

Supported nested shapes in v1:

- OpenAI-style `messages`
- OpenAI Responses-style `input`
- optional wrapper metadata such as request id, provider, route, timestamp, or status

The adapter should prefer:

- explicit nested request bodies
- existing provider analyzers once the request body is extracted
- wrapper metadata only as report metadata, not as prompt segments

## Outputs

Add a supported input class:

- `openai-compatible-request-log`

Expected behavior:

- `inspect <log.json>` returns a normal `ContextReport`
- if a wrapped request can be extracted cleanly, segment behavior should match the equivalent direct provider payload as closely as possible
- wrapper metadata should be preserved in report metadata when useful

## Internal Changes

- add log-shape detection before the current unsupported-payload failure path
- extract nested request bodies and dispatch them through existing analyzer paths where possible
- preserve explicit source typing so users can tell a direct provider payload from a wrapped request log
- keep unknown wrapper fields out of segment classification unless they clearly belong in the prompt

## Edge Cases And Failure Behavior

- if a log object contains multiple candidate request-body fields with conflicting content, fail with an actionable warning rather than guessing
- if wrapper metadata exists without a recognizable request body, fail with an unsupported-shape error
- if exact usage is absent, stay on tokenizer-based or heuristic confidence as appropriate
- do not classify generic metadata blobs as prompt segments

## Test Plan

- add one or more OpenAI-compatible request log fixtures
- add analyzer tests for wrapped `messages` and wrapped `input` payloads
- add fixture-backed tests proving that wrapped logs remain analyzable through `inspect`
- add CLI tests for at least one wrapped log fixture
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- Tokn accepts at least one wrapped chat-style request log
- Tokn accepts at least one wrapped responses-style request log
- wrapped request logs preserve normalized segment behavior instead of becoming generic metadata blobs
- unsupported or ambiguous wrapper shapes fail clearly

## Related ADRs

- [0002 Normalized Context Report Model](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0002-normalized-context-report-model.md)
- [0006 Public Alpha OSS Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0006-public-alpha-oss-contract.md)
- [0011 Defer LiteLLM Adapter And Prioritize OpenAI-Compatible Request Logs](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0011-defer-litellm-prioritize-openai-compatible-logs.md)
