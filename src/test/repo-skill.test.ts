import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const CODE_REVIEW_SKILL_PATH = path.join(
  process.cwd(),
  ".github",
  "skills",
  "code-review",
  "SKILL.md"
);
const CODE_REVIEW_CHECKLIST_PATH = path.join(
  process.cwd(),
  ".github",
  "skills",
  "code-review",
  "references",
  "tokn-review-checklist.md"
);

test("repo code review skill keeps safe project-specific metadata", () => {
  const skill = fs.readFileSync(CODE_REVIEW_SKILL_PATH, "utf8");
  const frontmatter = skill.slice(0, skill.indexOf("\n---", 4));

  assert.match(skill, /^---\nname: code-review\n/m);
  assert.match(skill, /^description: .*Tokn pull requests/m);
  assert.ok(Buffer.byteLength(skill, "utf8") < 4000);
  assert.match(skill, /references\/tokn-review-checklist\.md/);
  assert.match(skill, /Do not blindly apply/);
  assert.doesNotMatch(frontmatter, /^allowed-tools:/m);
  assert.doesNotMatch(skill, /auto-approve|automatically apply/i);

  const checklist = fs.readFileSync(CODE_REVIEW_CHECKLIST_PATH, "utf8");
  assert.match(checklist, /## Instruction Lint Correctness/);
  assert.match(checklist, /## Packaging And Release Integrity/);
  assert.match(checklist, /## Security And Supply Chain/);
  assert.doesNotMatch(checklist, /auto-approve|automatically apply/i);
});
