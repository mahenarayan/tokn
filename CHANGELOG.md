# Changelog

All notable changes to Orqis should be recorded in this file.

## Unreleased

- add `instructions-lint` for GitHub Copilot instruction files
- make `instructions-lint` preset-based with `copilot` and `agents-md`
- add Copilot instruction fixtures, golden outputs, and CLI coverage
- add `AGENTS.md` fixtures, preset-aware discovery, and CLI coverage
- add SDK exports for instruction lint reports
- add docs and examples for Copilot instruction linting
- reposition Orqis as a lint-first public alpha with experimental diagnostics kept secondary
- add trusted-publishing and supply-chain hardening workflows for public OSS release
- tighten the published npm package so it excludes compiled tests and internal docs
- add `CODEOWNERS`, `SUPPORT.md`, and `GOVERNANCE.md` for a clearer public maintainer posture
- add package-content verification to keep the npm tarball lean over time
- tighten the README front page for public alpha usage and add public-facing badges
- add release and issue-template routing for support and public release tracking

## 0.1.0

- initial public alpha release candidate
- TypeScript CLI + SDK for prompt/context visibility
- normalized context reports for OpenAI-style, OpenAI-compatible request log, OpenAI Responses-style, Anthropic, transcript, snapshot, OpenInference trace, and Langfuse trace inputs
- `inspect`, `diff`, `budget`, and `agent-report` commands
- `--json` support for all CLI commands
- fixture-backed, golden-output, and integration test coverage
