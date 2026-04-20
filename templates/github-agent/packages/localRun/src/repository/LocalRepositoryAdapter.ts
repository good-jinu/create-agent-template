import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
	CodeSearchResult,
	DeveloperProfile,
	FileReference,
	IRepositoryService,
	SearchOptions,
} from "@code-insight/core";

const execFileAsync = promisify(execFile);

export interface LocalRepositoryConfig {
	rootDir?: string;
}

export class LocalRepositoryAdapter implements IRepositoryService {
	private readonly rootDir: string;

	constructor(config: LocalRepositoryConfig = {}) {
		this.rootDir = path.resolve(config.rootDir ?? process.cwd());
	}

	async searchCode(
		query: string,
		options?: SearchOptions,
	): Promise<CodeSearchResult> {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return { totalCount: 0, items: [] };
		}

		const candidates = await this.listSearchableFiles();
		const filtered = candidates.filter((filePath) => {
			if (options?.path && !filePath.includes(options.path)) {
				return false;
			}

			if (options?.extensions?.length) {
				const ext = path.extname(filePath).slice(1).toLowerCase();
				return options.extensions.some(
					(candidate) => candidate.toLowerCase() === ext,
				);
			}

			return true;
		});

		const matches: FileReference[] = [];
		for (const relativePath of filtered) {
			const fullPath = path.join(this.rootDir, relativePath);
			try {
				const content = await fs.readFile(fullPath, "utf8");
				const relevanceScore = this.scoreContent(content, normalizedQuery);
				if (relevanceScore <= 0) continue;

				matches.push({
					path: relativePath,
					repository: `local:${path.basename(this.rootDir)}`,
					language: this.inferLanguage(relativePath),
					relevanceScore,
				});
			} catch {
				// Ignore unreadable files.
			}
		}

		matches.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

		const maxResults = options?.maxResults ?? 10;
		return {
			totalCount: matches.length,
			items: matches.slice(0, maxResults),
		};
	}

	async getFileContent(pathname: string, ref?: string): Promise<FileReference> {
		if (ref) {
			throw new Error("Local repository adapter does not support ref lookups.");
		}

		const normalizedPath = this.normalizeRelativePath(pathname);
		const fullPath = path.join(this.rootDir, normalizedPath);
		const content = await fs.readFile(fullPath, "utf8");
		const stat = await fs.stat(fullPath);

		return {
			path: normalizedPath,
			repository: `local:${path.basename(this.rootDir)}`,
			language: this.inferLanguage(normalizedPath),
			content,
			sha: `${stat.size}:${stat.mtimeMs}`,
		};
	}

	async getLastModifier(
		_repo: string,
		pathname: string,
		limit = 3,
	): Promise<DeveloperProfile[]> {
		const normalizedPath = this.normalizeRelativePath(pathname);

		try {
			const { stdout } = await execFileAsync(
				"git",
				[
					"log",
					"--follow",
					`--format=%H%x1f%an%x1f%ae%x1f%ad`,
					"--date=iso-strict",
					"-n",
					"50",
					"--",
					normalizedPath,
				],
				{ cwd: this.rootDir },
			);

			const authorMap = new Map<string, DeveloperProfile>();
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				const [, name, email, date] = line.split("\x1f");
				const githubUsername = email.split("@")[0] || name || "unknown";
				const existing = authorMap.get(githubUsername);
				if (existing) {
					existing.commitCount += 1;
					if (date > existing.lastCommitDate) {
						existing.lastCommitDate = date;
					}
					continue;
				}

				authorMap.set(githubUsername, {
					githubUsername,
					name: name || githubUsername,
					email: email || "",
					slackUserId: undefined,
					commitCount: 1,
					lastCommitDate: date || "",
					recentFiles: [normalizedPath],
				});
			}

			return Array.from(authorMap.values())
				.sort(
					(a, b) =>
						b.commitCount - a.commitCount ||
						b.lastCommitDate.localeCompare(a.lastCommitDate),
				)
				.slice(0, limit);
		} catch {
			return [];
		}
	}

	private async listSearchableFiles(): Promise<string[]> {
		try {
			const { stdout } = await execFileAsync(
				"git",
				["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
				{ cwd: this.rootDir },
			);
			return stdout
				.split("\0")
				.map((entry) => entry.trim())
				.filter(Boolean)
				.filter((entry) => this.isSearchablePath(entry));
		} catch {
			return this.walkFiles(this.rootDir);
		}
	}

	private async walkFiles(dir: string): Promise<string[]> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const results: string[] = [];

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relativePath = path.relative(this.rootDir, fullPath);

			if (entry.isDirectory()) {
				if (
					entry.name === "node_modules" ||
					entry.name === ".git" ||
					entry.name === "dist"
				) {
					continue;
				}
				results.push(...(await this.walkFiles(fullPath)));
				continue;
			}

			if (this.isSearchablePath(relativePath)) {
				results.push(relativePath);
			}
		}

		return results;
	}

	private isSearchablePath(relativePath: string): boolean {
		return (
			!relativePath.includes("node_modules/") &&
			!relativePath.startsWith("dist/") &&
			!relativePath.startsWith(".git/") &&
			!relativePath.endsWith(".map") &&
			!relativePath.endsWith(".mjs")
		);
	}

	private normalizeRelativePath(input: string): string {
		const normalized = path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "");
		if (path.isAbsolute(normalized)) {
			return path.relative(this.rootDir, normalized);
		}
		return normalized;
	}

	private scoreContent(content: string, query: string): number {
		const lower = content.toLowerCase();
		let score = 0;
		let index = lower.indexOf(query);
		while (index !== -1) {
			score += 1;
			index = lower.indexOf(query, index + query.length);
		}
		return score;
	}

	private inferLanguage(filename: string): string {
		const ext = filename.split(".").pop()?.toLowerCase();
		const languageMap: Record<string, string> = {
			ts: "TypeScript",
			tsx: "TypeScript",
			js: "JavaScript",
			jsx: "JavaScript",
			json: "JSON",
			md: "Markdown",
			yaml: "YAML",
			yml: "YAML",
			cjs: "CommonJS",
			mjs: "JavaScript",
			sh: "Shell",
			sql: "SQL",
		};
		return languageMap[ext ?? ""] ?? "Unknown";
	}
}
