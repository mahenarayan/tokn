# OSS Public Alpha Foundation

## Problem

Tokn has a functioning codebase, but external adoption requires more than working code.
Open-source users need a clear support contract, contributor flow, packaging hygiene, and stable project boundaries.

## Goals

- make the repository legible to external contributors
- define the public-alpha support posture
- verify the npm package contents and installability path
- harden public CI and publishing for a lean supply chain
- document how the project is intended to evolve without expanding scope casually

## In Scope

- public repository docs
- contribution and security process
- license and changelog
- package metadata for public consumption
- CI checks for package verification
- dependency and code-scanning workflows
- secure npm publishing workflow and release guide
- explicit status messaging in the README

## Out Of Scope

- hosted documentation site
- 1.0 stability guarantees
- governance beyond a maintainer-led project
- new runtime features unrelated to the stable lint surface

## Deliverables

- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `CHANGELOG.md`
- README updates for public alpha positioning
- package metadata updates
- CI package verification
- dependency review and code-scanning workflows
- trusted publishing workflow
- release documentation

## Acceptance Criteria

- a new contributor can understand how to contribute safely
- a new user can understand supported inputs and current limitations
- the repository has a clear license and disclosure path
- package metadata points to the source repository and issue tracker
- CI verifies both tests and package creation
- the public release path avoids long-lived npm publish tokens
- workflow permissions and action pinning are explicit in version control

## Verification

- `npm run check`
- `npm run pack:check`
