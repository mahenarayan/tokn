# Releasing Tokn

This project keeps the public release path intentionally small and explicit.
The stable public contract is `instructions-lint`.

## Prerequisites

Before the first public publish:

1. Reserve the npm package and verify the intended maintainers.
2. Configure npm trusted publishing for this repository and the `release.yml` workflow.
3. Require npm 2FA for maintainer accounts.
4. Make the repository public so provenance, scorecards, and code scanning are visible.
5. Enable branch protection on `main` and require the CI, Dependency Review, CodeQL, and Scorecards workflows.

## Release Workflow

The repository ships a GitHub Actions publish workflow at [release.yml](/Users/raksha/Documents/Projects/probe/.github/workflows/release.yml).
Use the GitHub issue template at [.github/ISSUE_TEMPLATE/release-checklist.md](/Users/raksha/Documents/Projects/probe/.github/ISSUE_TEMPLATE/release-checklist.md) to track each public release.

That workflow:

- checks out the pinned repository revision
- installs dependencies with `npm ci --ignore-scripts`
- runs `npm run check`
- creates the publishable tarball with `npm pack`
- uploads the tarball as a workflow artifact
- generates build provenance for the packed artifact
- publishes to npm with provenance through GitHub OIDC trusted publishing
- verifies that the npm tarball excludes compiled tests and internal repository docs

## Local Verification

Run this before cutting a release:

```bash
npm install --cache .npm-cache
npm run check
npm run smoke
npm run pack:check
```

## Supply-Chain Posture

The public repository baseline is:

- GitHub Actions pinned to full commit SHAs
- least-privilege workflow permissions
- dependency review on pull requests
- CodeQL scanning on pull requests, pushes, and a schedule
- OSSF Scorecards on the default branch and on a schedule
- npm trusted publishing instead of long-lived publish tokens
- a lean published tarball that contains runtime artifacts plus public support metadata only

## Notes

- The release workflow assumes the npm trusted publisher has already been configured in npm.
- The workflow publishes only on GitHub Release publication.
- CodeQL, Scorecards, and dependency review are intended for the public repository baseline and skip automatically while the repository is private.
- If package ownership, repository visibility, or trusted publisher setup is missing, publishing should remain disabled until those are corrected.
- Repository settings still need to be configured outside git: branch protection or rulesets, private vulnerability reporting, and optional Discussions or a social preview image.
