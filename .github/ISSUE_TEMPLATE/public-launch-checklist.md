---
name: Public launch checklist
about: Track the one-time public OSS launch work for Tokn
title: "[Launch] Public OSS readiness"
labels: launch
assignees: ""
---

## Repository Visibility

- [ ] repository visibility changed to public
- [ ] GitHub community profile reviewed after the visibility change

## Repository Security

- [ ] vulnerability alerts enabled
- [ ] private vulnerability reporting enabled
- [ ] branch protection or rulesets enabled on `main`
- [ ] required checks configured: `CI`, `Dependency Review`, `CodeQL`
- [ ] conversation resolution required before merge
- [ ] `delete branch on merge` enabled

## Registry And Publishing

- [ ] npm package `@tokn-labs/tokn` verified
- [ ] npm trusted publishing verified for `mahenarayan/tokn` and `release.yml`
- [ ] npm maintainer access reviewed
- [ ] npm 2FA enforced and token-based publishing disabled

## First Public Validation

- [ ] `npm run check`
- [ ] `npm run smoke`
- [ ] `npm run pack:check`
- [ ] clean install path validated: `npm install -g @tokn-labs/tokn`
- [ ] first public GitHub Release published
- [ ] npm provenance visible on the package page
- [ ] CodeQL and Scorecards confirmed running after the repository became public

## Follow-Up

- [ ] README badges and links verified on the public repository
- [ ] launch notes or demo checklist prepared
- [ ] follow-up issues filed for anything intentionally deferred
