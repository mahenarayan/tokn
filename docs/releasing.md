# Releasing Tokn

This project keeps the public release path intentionally small and explicit.
The stable public contract is `instructions-lint`.

## Current Status

The npm package `@tokn-labs/tokn` is already published.
The official release path is GitHub Release driven: publishing a GitHub Release with tag `v<package.version>` triggers the release workflow, verifies the package, and publishes that exact version to npm.

Older package versions may exist without a matching GitHub Release.
Do not create a GitHub Release for an already-published npm version because the workflow will correctly refuse to republish it.

## Prerequisites

Before publishing a release:

1. Configure npm trusted publishing for this repository and the `release.yml` workflow.
2. Require npm 2FA for maintainer accounts and disable token based publishing if possible.
3. Keep the repository public so provenance, scorecards, and code scanning are visible.
4. Keep branch protection or rulesets on `main` and require the CI, Dependency Review, and CodeQL workflows.

Track one-time launch work in the private maintainer planning repository.

## Release Workflow

The repository ships a GitHub Actions publish workflow at [release.yml](https://github.com/mahenarayan/tokn/blob/main/.github/workflows/release.yml).
Use the private maintainer planning repository to track each public release after launch.

That workflow:

- checks out the pinned repository revision
- installs dependencies with `npm ci --ignore-scripts`
- verifies the release tag matches `package.json`
- verifies the npm version is not already published
- runs `npm run check`
- creates the publishable tarball with `npm pack`
- uploads the tarball as a workflow artifact
- generates build provenance for the packed artifact
- publishes to npm through GitHub OIDC trusted publishing, which generates npm provenance automatically
- verifies that the npm tarball excludes compiled tests and internal repository docs

## Local Verification

Run this before cutting a release:

```bash
npm install --cache .npm-cache
npm run check
npm run smoke
npm run pack:check
```

## Release Sequence

1. Move the changelog entries for the release under `## <version>`.
2. Bump `package.json` and `package-lock.json` to the same version.
3. Verify the version is not already on npm:

```bash
npm view @tokn-labs/tokn@<version> version --cache .npm-cache
```

Expected result for a new version is an npm `E404`.

4. Open and merge the release-prep pull request into `main`.
5. Create and publish a GitHub Release from `main` with a tag matching the package version:

```bash
gh release create v<version> --target main --title "Tokn v<version>" --notes-file <release-notes-file>
```

6. Watch the `Release` workflow.
7. After the workflow succeeds, verify npm:

```bash
npm view @tokn-labs/tokn version dist-tags --cache .npm-cache
```

## Supply Chain Posture

The public repository baseline is:

- GitHub Actions pinned to full commit SHAs
- least privilege workflow permissions
- dependency review on pull requests
- CodeQL scanning on pull requests, pushes, and a schedule
- OSSF Scorecards on the default branch and on a schedule
- npm trusted publishing instead of long lived publish tokens
- a lean published tarball that contains runtime artifacts plus public support metadata only

## Notes

- The release workflow assumes the npm trusted publisher is already configured in npm.
- For npm trusted publishing, configure package `@tokn-labs/tokn` with:
  - provider: `GitHub Actions`
  - GitHub user or organization: `mahenarayan`
  - repository: `tokn`
  - workflow filename: `release.yml`
- The workflow publishes only on GitHub Release publication.
- If package ownership, repository visibility, or trusted publisher setup is missing, publishing should remain disabled until those are corrected.
- Some repository settings still need to be configured outside git: branch protection or rulesets, private vulnerability reporting, and optional Discussions or a social preview image.
