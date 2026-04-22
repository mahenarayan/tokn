# Provider Payload Debugging

Use this when you have a saved provider request and need to understand what is actually inside the prompt window.

## OpenAI Responses Example

Fixture:

- `fixtures/openai-responses-request.json`

Command:

```bash
node dist/cli.js inspect fixtures/openai-responses-request.json --format markdown
```

What this demonstrates:

- top-level `instructions`
- structured `input` items
- attachments like images and files
- tool schema and tool output accounting
- provider-reported token totals when present

Use this workflow when you want to answer questions like:

- how much of the request is tool declaration versus user input
- whether attachments are being classified correctly
- whether the provider reported more tokens than the visible segments explain

## Anthropic Structured Example

Fixture:

- `fixtures/anthropic-structured.json`

Command:

```bash
node dist/cli.js inspect fixtures/anthropic-structured.json
```

What this demonstrates:

- structured `system` blocks
- image and document attachment handling
- tool use and tool result segmentation
- mixed exact and conservative accounting paths

Why it matters:

Provider payloads are not just plain chat history anymore.
This is the fastest way to verify whether Tokn is classifying modern request structure the way you expect before you trust the rest of the diagnosis.

## OpenAI-Compatible Request Log Example

Fixture:

- `fixtures/openai-compatible-chat-log.json`

Command:

```bash
node dist/cli.js inspect fixtures/openai-compatible-chat-log.json
```

What this demonstrates:

- wrapped request extraction from common log fields such as `request_body`
- reuse of the normal OpenAI message analyzer after extraction
- wrapper metadata preserved in report metadata instead of being misclassified as prompt segments

Why it matters:

Many gateways and wrappers persist request logs instead of raw provider payloads.
This path lets you inspect those logs directly without hand-copying the nested request body first.
