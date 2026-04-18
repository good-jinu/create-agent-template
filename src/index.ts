#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "template");

async function replaceInFile(filePath: string, oldName: string, newName: string) {
  try {
    const content = await readFile(filePath, "utf-8");
    const updated = content
      .replaceAll(`@${oldName}`, `@${newName}`)
      .replaceAll(oldName, newName);
    if (updated !== content) await writeFile(filePath, updated, "utf-8");
  } catch {
    // skip binary files
  }
}

async function walk(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function main() {
  p.intro(pc.bgCyan(pc.black(" create-agent-template ")));

  let projectName = process.argv[2];

  if (!projectName) {
    const result = await p.text({
      message: "Project name?",
      placeholder: "my-agent",
      validate: (v) => (!v.trim() ? "Required" : undefined),
    });
    if (p.isCancel(result)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    projectName = result;
  }

  const dest = join(process.cwd(), projectName);

  const s = p.spinner();
  s.start("Copying template...");

  await cp(TEMPLATE_DIR, dest, { recursive: true });

  const files = await walk(dest);
  for (const file of files) {
    await replaceInFile(file, "code-insight", projectName);
  }

  s.stop("Template copied!");

  const install = await p.confirm({ message: "Run pnpm install?" });
  if (!p.isCancel(install) && install) {
    const s2 = p.spinner();
    s2.start("Installing...");
    try {
      execSync("pnpm install", { cwd: dest, stdio: "inherit" });
      s2.stop("Installed!");
    } catch {
      s2.stop("Install failed — run pnpm install manually.");
    }
  }

  p.outro(
    `${pc.green("✓")} ${pc.bold(projectName)} ready!\n\n` +
      `  cd ${projectName}\n` +
      `  cp .env.example .env\n` +
      `  pnpm local:run`,
  );
}

main().catch(console.error);
