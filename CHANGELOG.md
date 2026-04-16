# Changelog

All notable changes to Orqis should be recorded in this file.

## Unreleased

- add `instructions-lint` for GitHub Copilot instruction files
- add Copilot instruction fixtures, golden outputs, and CLI coverage
- add SDK exports for instruction lint reports
- add docs and examples for Copilot instruction linting

## 0.1.0

- initial public alpha release candidate
- TypeScript CLI + SDK for prompt/context visibility
- normalized context reports for OpenAI-style, OpenAI-compatible request log, OpenAI Responses-style, Anthropic, transcript, snapshot, OpenInference trace, and Langfuse trace inputs
- `inspect`, `diff`, `budget`, and `agent-report` commands
- `--json` support for all CLI commands
- fixture-backed, golden-output, and integration test coverage
