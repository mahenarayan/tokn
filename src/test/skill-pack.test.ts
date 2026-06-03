import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

interface SkillManifest {
  name: string;
  entry: string;
  inputSchema: string;
  adapters: Record<string, string>;
}

const SKILL_ROOT = path.join(process.cwd(), "skills", "tokn-instruction-repair");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

test("tokn instruction repair skill pack has one portable entry and valid adapters", () => {
  const manifestPath = path.join(SKILL_ROOT, "manifest.json");
  const manifest = readJson<SkillManifest>(manifestPath);

  assert.equal(manifest.name, "tokn-instruction-repair");

  const entryPath = path.join(SKILL_ROOT, manifest.entry);
  assert.equal(path.basename(entryPath), "skill.md");
  assert.match(fs.readFileSync(entryPath, "utf8"), /harness-neutral workflow/);

  const schemaPath = path.join(SKILL_ROOT, manifest.inputSchema);
  const schema = readJson<Record<string, unknown>>(schemaPath);
  assert.equal(schema.title, "Tokn Instruction Repair Input");

  for (const [adapter, adapterPath] of Object.entries(manifest.adapters)) {
    const absoluteAdapterPath = path.join(SKILL_ROOT, adapterPath);
    assert.ok(fs.existsSync(absoluteAdapterPath), `${adapter} adapter should exist`);
    assert.match(
      fs.readFileSync(absoluteAdapterPath, "utf8"),
      /skill\.md/,
      `${adapter} adapter should reference the canonical skill`
    );
  }

  for (const exampleFile of ["finding.json", "before.md", "after.md"]) {
    assert.ok(
      fs.existsSync(path.join(SKILL_ROOT, "examples", exampleFile)),
      `${exampleFile} example should exist`
    );
  }
});
