# Security Policy

## Supported Versions

Security fixes are best effort during public alpha.
The supported line is the latest published `0.x` release and the current `main` branch tip.

## Reporting A Vulnerability

Do not open a public GitHub issue for a potential security vulnerability.

Report vulnerabilities through GitHub private vulnerability reporting when it is enabled for the repository.
If private vulnerability reporting is not available yet, open a minimal public issue requesting a private reporting channel and do not include exploit details.

Please include:

- affected version or commit
- reproduction steps or a proof of concept
- impact assessment if known
- any suggested mitigation

## Response Expectations

Best effort process:

- acknowledge receipt within 5 business days
- validate and assess severity
- prepare a fix or mitigation
- disclose publicly after a fix is available or the issue is understood well enough to communicate safely

## Scope

This project is a read-only CLI + SDK for local/offline analysis and instruction governance.
The main realistic security concerns are:

- malicious or malformed input files
- unsafe parsing assumptions
- supply-chain risk in packaging and dependencies

## Release Integrity

The public release path is designed to minimize long-lived credential risk and make published artifacts easier to verify:

- npm publishing is intended to use GitHub Actions trusted publishing with provenance
- GitHub Actions are pinned to full commit SHAs
- CI and security workflows use least-privilege permissions
- pull requests run dependency review before merge
- public code scanning and scorecard checks are part of the repository baseline
- the published npm artifact is checked to exclude compiled tests and internal design docs

If you find a weakness in the release or packaging chain, report it through the private process above.
