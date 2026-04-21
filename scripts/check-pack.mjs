import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  ["pack", "--dry-run", "--json", "--cache", ".npm-cache"],
  {
    cwd: process.cwd(),
    encoding: "utf8"
  }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const packOutput = JSON.parse(result.stdout);
assert.ok(Array.isArray(packOutput) && packOutput.length > 0, "npm pack did not return package metadata");

const tarball = packOutput[0];
const files = Array.isArray(tarball.files) ? tarball.files.map((entry) => entry.path) : [];

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  "SUPPORT.md",
  "GOVERNANCE.md",
  "dist/cli.js",
  "dist/index.js",
  "dist/types.d.ts"
];

const forbiddenPrefixes = [
  "dist/test/",
  "docs/",
  ".github/",
  "src/"
];

for (const file of requiredFiles) {
  assert.ok(files.includes(file), `npm package is missing required file: ${file}`);
}

for (const file of files) {
  const forbiddenPrefix = forbiddenPrefixes.find((prefix) => file.startsWith(prefix));
  assert.ok(!forbiddenPrefix, `npm package contains unexpected file: ${file}`);
}

process.stdout.write(
  [
    "npm package contents verified",
    `entries: ${tarball.entryCount ?? files.length}`,
    `size: ${tarball.size ?? "unknown"} bytes`
  ].join("\n") + "\n"
);
