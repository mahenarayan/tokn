# Changelog

All notable changes to Tokn should be recorded in this file.

## Unreleased

- add a harness-neutral `tokn-instruction-repair` skill pack for repairing Tokn findings while preserving instruction intent

## 0.5.2

- document the refactored instruction lint pipeline and module responsibilities
- clarify that instruction lint analysis is deterministic static analysis over repository instruction files
- release internal instruction-lint architecture cleanup without public API or schema changes

## 0.5.1

- fix instruction coverage maps for repositories with no discovered instruction files so visible files are reported as uncovered targets instead of zero targets
- fix coverage maps when all instruction files are ignored so remaining visible repository files are still counted as uncovered targets

## 0.5.0

- add an instruction coverage map to `instructions-lint` JSON reports, showing target files, applicable instruction files, and estimated target load
- render compact coverage summaries in text and Markdown reports, preferring source and documentation targets for human readability
- reuse coverage target-load analysis for the applicable-token budget check so budget findings and coverage reporting stay aligned
- validate unsupported YAML frontmatter value types for `applyTo`, `description`, and `excludeAgent`
- preserve YAML array brace globs and normalize instruction glob paths before matching repository files
- fix single-file instruction linting so repository roots and `applyTo` matching resolve consistently

## 0.4.1

- add verbose statement token estimates for `instructions-lint`
- parse Copilot instruction frontmatter with YAML for quoted globs, arrays, block descriptions, and inline comments
- keep runtime dependency policy explicit by exact-pinning `yaml`
- estimate path-specific Copilot token budgets from instruction body text instead of frontmatter activation metadata
- clarify README positioning around the stable `instructions-lint` contract and experimental diagnostics

## 0.4.0

- reduce false positives for description-triggered Copilot instruction files and non-code-review usage
- make `instructions-lint` default to all supported instruction surfaces, with the Copilot code review character cap reported conditionally unless `--surface code-review` is selected
- add configurable instruction lint budgets for repository, path-specific, statement, and target-load limits
- add calibrated starter config generation through `tokn instructions-lint --init-config`, plus top-level `tokn init` and `tokn calibrate` aliases
- add structured relevance metadata to JSON findings, including category, confidence, surface applicability, activation type, and grouping
- keep text and Markdown reports minimal by moving description-only activation details into report notes
- update schemas, fixtures, docs, and regression tests for the context-engineering lint policy model

## 0.3.0

- detect known external agent instruction surfaces such as `CLAUDE.md`, `GEMINI.md`, and Cursor rule files as visibility-only warnings
- discover symlinked instruction files that resolve to regular files
- add an agentic public-repo demo mode for OpenAI, Anthropic, Meta, and PyTorch examples
- clarify that instruction linting is for context and agent engineering, with code review as one supported surface
- improve text and Markdown reports with explicit limits, terms, target-load language, and spacing between findings
- document profile budgets and the Copilot code review platform character limit

## 0.2.0

- add enterprise rollout metadata for `tokn.config.json`
- add advisory report-only mode with `failOnSeverity: "off"`
- include rollout stage and ownership metadata in instruction lint reports
- document advisory, baseline, and enforced rollout phases for enterprise adoption
- update config and report schemas for rollout metadata and advisory thresholds

## 0.1.3

- prepare the first GitHub Release driven npm publish flow
- add a release workflow preflight that fails before publish if the package version already exists on npm
- fix the release workflow tarball path passed to `npm publish`
- document the official release sequence around GitHub Releases and npm trusted publishing
- keep agent-facing design docs public while leaving completed roadmap and launch planning docs out of the default public surface

Note: `0.1.2` was prepared but not published to npm. Its GitHub Release was deleted after a failed publish attempt, and the tag could not be reused because GitHub marked the published release as immutable.

## 0.1.1

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
