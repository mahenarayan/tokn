# Instruction Drift Demo Fixture

This fixture gives a deterministic local demo of instruction drift without cloning a public repository.

Build first:

```bash
npm install --cache .npm-cache
npm run build
```

Run the full lint:

```bash
node dist/cli.js instructions-lint fixtures/instructions/drift-demo-repo \
  --fail-on-severity off
```

Run only drift findings:

```bash
node dist/cli.js instructions-lint fixtures/instructions/drift-demo-repo \
  --only-category drift \
  --fail-on-severity off
```

Run only stale file references:

```bash
node dist/cli.js instructions-lint fixtures/instructions/drift-demo-repo \
  --only-rule missing-file-reference \
  --fail-on-severity off
```

Inspect the aggregate JSON:

```bash
node dist/cli.js instructions-lint fixtures/instructions/drift-demo-repo \
  --only-category drift \
  --fail-on-severity off \
  --format json \
  | jq '.drift'
```

The fixture intentionally contains:

- `npm run verify:legacy`, but `package.json` only defines `test`
- `src/legacy/storage.ts`, but the repository only has `src/current/storage.ts`
- `readGlobalStateFromDisk()`, but the current code exposes `readGlobalStateFromStorage()`
- `src/current/storage.ts`, which should not be reported as drift
