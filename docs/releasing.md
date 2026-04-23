# Releasing Tokn

This project keeps the public release path intentionally small and explicit.
The stable public contract is `instructions-lint`.

## Prerequisites

Before the first public launch:

1. Publish the npm package `@tokn-labs/tokn` and verify the intended maintainers.
2. Configure npm trusted publishing for this repository and the `release.yml` workflow.
3. Require npm 2FA for maintainer accounts and disable token-based publishing if possible.
4. Make the repository public so provenance, scorecards, and code scanning are visible.
5. Enable branch protection or rulesets on `main` and require the CI, Dependency Review, and CodeQL workflows.

Track the one-time launch work in [docs/public-launch-checklist.md](https://github.com/mahenarayan/tokn/blob/main/docs/public-launch-checklist.md) or from the issue template at [.github/ISSUE_TEMPLATE/public-launch-checklist.md](https://github.com/mahenarayan/tokn/blob/main/.github/ISSUE_TEMPLATE/public-launch-checklist.md).

## Release Workflow

The repository ships a GitHub Actions publish workflow at [release.yml](https://github.com/mahenarayan/tokn/blob/main/.github/workflows/release.yml).
Use the GitHub issue template at [.github/ISSUE_TEMPLATE/release-checklist.md](https://github.com/mahenarayan/tokn/blob/main/.github/ISSUE_TEMPLATE/release-checklist.md) to track each public release after launch.

That workflow:

- checks out the pinned repository revision
- installs dependencies with `npm ci --ignore-scripts`
- runs `npm run check`
- creates the publishable tarball with `npm pack`
- uploads the tarball as a workflow artifact
- generates build provenance for the packed artifact
- publishes to npm through GitHub OIDC trusted publishing
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

- The release workflow assumes the npm trusted publisher is already configured in npm.
- For npm trusted publishing, configure package `@tokn-labs/tokn` with:
  - provider: `GitHub Actions`
  - GitHub user or organization: `mahenarayan`
  - repository: `tokn`
  - workflow filename: `release.yml`
- The workflow publishes only on GitHub Release publication.
- CodeQL, Scorecards, and dependency review are intended for the public repository baseline and skip automatically while the repository is private.
- If package ownership, repository visibility, or trusted publisher setup is missing, publishing should remain disabled until those are corrected.
- Some repository settings still need to be configured outside git: branch protection or rulesets, private vulnerability reporting, and optional Discussions or a social preview image.
