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

test("repo code review skill keeps safe project-specific metadata", () => {
  const skill = fs.readFileSync(CODE_REVIEW_SKILL_PATH, "utf8");
  const frontmatter = skill.slice(0, skill.indexOf("\n---", 4));

  assert.match(skill, /^---\nname: code-review\n/m);
  assert.match(skill, /^description: .*Tokn pull requests/m);
  assert.match(skill, /## Tokn-Specific Review Priorities/);
  assert.match(skill, /Do not blindly apply/);
  assert.doesNotMatch(frontmatter, /^allowed-tools:/m);
  assert.doesNotMatch(skill, /auto-approve|automatically apply/i);
});
