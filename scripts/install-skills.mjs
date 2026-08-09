#!/usr/bin/env node

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const force = args.includes("--force");
const targetOption = valueAfter("--target") || "codex";
const repoRoot = resolve(import.meta.dirname, "..");
const skillsRoot = join(repoRoot, "skills");

const resolveTarget = (target) => {
  if (target === "codex") {
    return resolve(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills");
  }
  if (target === "cc-switch") {
    return resolve(homedir(), ".cc-switch", "skills");
  }
  return resolve(target);
};

const targetRoot = resolveTarget(targetOption);
const entries = await readdir(skillsRoot, { withFileTypes: true });
const skillNames = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("ican-"))
  .map((entry) => entry.name)
  .sort();

if (skillNames.length === 0) {
  throw new Error(`No ican-* skills found under ${skillsRoot}`);
}

await mkdir(targetRoot, { recursive: true });
const conflicts = [];
for (const name of skillNames) {
  const destination = join(targetRoot, name);
  try {
    if ((await stat(destination)).isDirectory()) conflicts.push(name);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (conflicts.length > 0 && !force) {
  console.error(
    JSON.stringify(
      {
        error: "skills_already_exist",
        target: targetRoot,
        conflicts,
        hint: "Re-run with --force only after confirming these skills may be updated."
      },
      null,
      2
    )
  );
  process.exit(2);
}

for (const name of skillNames) {
  await cp(join(skillsRoot, name), join(targetRoot, name), {
    recursive: true,
    force
  });
}

console.log(
  JSON.stringify(
    {
      target: targetRoot,
      installed: skillNames,
      updatedExisting: force
    },
    null,
    2
  )
);
