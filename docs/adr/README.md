# Architecture Decision Records

## Purpose

This directory stores major architectural and product-boundary decisions for Tokn.

ADRs are for decisions that should remain understandable even after the original implementation context is gone.

## Current ADRs

- [0001 File Mutation Boundary](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0001-read-only-analysis-boundary.md)
- [0002 Normalized Context Report Model](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0002-normalized-context-report-model.md)
- [0003 Fixture And Golden Test Bed](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0003-fixture-and-golden-test-bed.md)
- [0004 Structured CLI Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0004-machine-readable-cli-contract.md)
- [0005 Trace Import Via OpenInference](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0005-trace-import-via-openinference.md)
- [0006 Public Alpha OSS Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0006-public-alpha-oss-contract.md)
- [0007 Suggestions Embedded In Context Reports](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0007-suggestions-in-context-report.md)
- [0008 Threshold Based Check Command](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0008-threshold-based-check-command.md)
- [0009 Multi Format CLI Output](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0009-multi-format-cli-output.md)
- [0010 Langfuse Trace Import](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0010-langfuse-trace-import.md)
- [0011 Defer LiteLLM Adapter And Prioritize OpenAI Compatible Request Logs](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0011-defer-litellm-prioritize-openai-compatible-logs.md)
- [0012 Separate Instruction Lint Report Family](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0012-separate-instruction-lint-report-family.md)
- [0013 Lint Focused Public Product Boundary](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0013-lint-first-public-product-boundary.md)

## Rules

- Add a new ADR for major lasting decisions.
- Do not rewrite prior ADRs to hide history; supersede them with a new ADR when needed.
- Keep each ADR concrete and decision-oriented.
- Link related specs when the decision came from a feature proposal.
