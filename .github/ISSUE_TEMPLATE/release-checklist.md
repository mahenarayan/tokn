---
name: Release checklist
about: Track a public release from verification through publish
title: "[Release] "
labels: release
assignees: ""
---

## Release Summary

- target version:
- release type:
- target date:

## Verification

- [ ] `npm run check`
- [ ] `npm run smoke`
- [ ] `npm run pack:check`
- [ ] CLI examples in the README still match the current behavior

## Package And Docs

- [ ] `CHANGELOG.md` is updated
- [ ] public docs changed with the release are updated
- [ ] stable vs experimental scope is still accurately described
- [ ] package contents were reviewed and remain lean

## Repository And Registry Posture

- [ ] required GitHub checks are green on `main`
- [ ] npm trusted publishing is configured and healthy
- [ ] maintainer publishing access and 2FA status are confirmed
- [ ] private vulnerability reporting is enabled

## Publish

- [ ] GitHub Release notes are drafted
- [ ] GitHub Release is published
- [ ] npm package published with provenance
- [ ] published install path is checked

## Follow Up

- [ ] release announcement or demo notes updated if needed
- [ ] next milestone or follow up issue is tracked
