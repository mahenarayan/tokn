# Public Launch Checklist

This checklist tracks the one time steps to move Tokn from a private development repository to a public OSS repository with a mature release posture.

Use [.github/ISSUE_TEMPLATE/public-launch-checklist.md](https://github.com/mahenarayan/tokn/blob/main/.github/ISSUE_TEMPLATE/public-launch-checklist.md) to track the launch in GitHub.
Use [.github/ISSUE_TEMPLATE/release-checklist.md](https://github.com/mahenarayan/tokn/blob/main/.github/ISSUE_TEMPLATE/release-checklist.md) for normal per-release work after the launch.

## GitHub Repository

- [ ] change repository visibility to public
- [ ] enable vulnerability alerts
- [ ] enable private vulnerability reporting
- [ ] enable branch protection or rulesets on `main`
- [ ] require pull requests before merge
- [ ] require status checks: `CI`, `Dependency Review`, `CodeQL`
- [ ] require conversation resolution before merge
- [ ] disable force-push and branch deletion on the protected branch
- [ ] enable `delete branch on merge`
- [ ] decide whether GitHub Discussions should be enabled for support

## Security And Supply Chain

- [ ] verify CodeQL starts running after the repository is public
- [ ] verify OSSF Scorecards starts running after the repository is public
- [ ] verify dependency review runs on pull requests
- [ ] keep GitHub Actions pinned to full commit SHAs
- [ ] confirm the npm trusted publisher points to `mahenarayan/tokn` and `release.yml`
- [ ] require npm 2FA for maintainers and disallow token based publishing
- [ ] verify at least one backup maintainer has npm publish access if desired

## Package And Docs

- [ ] confirm `npm install -g @tokn-labs/tokn` works on a clean machine
- [ ] confirm `tokn --help` and `tokn instructions-lint` work after install
- [ ] verify README quick start matches the released package behavior
- [ ] review `SECURITY.md`, `SUPPORT.md`, and `GOVERNANCE.md` for public wording
- [ ] review the GitHub community profile after the repository is public

## First Public Release

- [ ] run `npm run check`
- [ ] run `npm run smoke`
- [ ] run `npm run pack:check`
- [ ] draft GitHub Release notes
- [ ] publish the GitHub Release
- [ ] confirm the release workflow publishes to npm through trusted publishing
- [ ] confirm the npm package page shows provenance
- [ ] confirm the GitHub artifact attestation exists for the packed tarball

## Optional Polish

- [ ] add or verify a repository social preview image
- [ ] add or verify README badges that only make sense after the repository is public
- [ ] write a short launch post, demo brief, or release announcement
