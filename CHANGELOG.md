# Changelog

All notable changes to Tokn should be recorded in this file.

## Unreleased

- add `instructions-lint` for GitHub Copilot instruction files
- make `instructions-lint` use explicit `copilot` and `agents-md` presets
- add Copilot instruction fixtures, golden outputs, and CLI coverage
- add `AGENTS.md` fixtures, preset-aware discovery, and CLI coverage
- add SDK exports for instruction lint reports
- add docs and examples for Copilot instruction linting
- add local config discovery, ignore/suppression controls, and baseline support for `instructions-lint`
- add stable JSON schemas and instruction lint reports with schema versions
- add GitHub annotation output plus published rule docs and support matrix for `instructions-lint`
- add Azure Pipelines output and enterprise rollout docs for instruction lint adoption
- add a reproducible OpenAI Agents Python case study for context engineering instruction diagnostics
- reposition Tokn as a lint focused public alpha with experimental diagnostics kept secondary
- add trusted publishing and supply chain hardening workflows for public OSS release
- tighten the published npm package so it excludes compiled tests and internal docs
- add `CODEOWNERS`, `SUPPORT.md`, and `GOVERNANCE.md` for a clearer public maintainer posture
- add package content verification to keep the npm tarball lean over time
- tighten the README front page for public alpha usage and add public badges
- add release and issue-template routing for support and public release tracking

## 0.1.0

- initial public alpha release candidate
- TypeScript CLI + SDK for prompt/context visibility
- normalized context reports for OpenAI style, OpenAI compatible request log, OpenAI Responses style, Anthropic, transcript, snapshot, OpenInference trace, and Langfuse trace inputs
- `inspect`, `diff`, `budget`, and `agent-report` commands
- `--json` support for all CLI commands
- fixture based, golden output, and integration test coverage
