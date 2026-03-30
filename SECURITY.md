# Security Policy

## Reporting A Vulnerability

Do not open a public GitHub issue for a potential security vulnerability.

Report vulnerabilities privately to:

- `maheshn1@icloud.com`

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

This project is a read-only CLI + SDK for local/offline analysis.
The main realistic security concerns are:

- malicious or malformed input files
- unsafe parsing assumptions
- supply-chain risk in packaging and dependencies
