import type {
	CodeSearchResult,
	DeveloperProfile,
	FileReference,
	IRepositoryService,
	SearchOptions,
} from "@code-insight/core";
import { Octokit } from "octokit";

export interface GitHubConfig {
	token: string;
	owner: string;
}

export class GitHubAPIAdapter implements IRepositoryService {
	private readonly octokit: Octokit;
	private readonly owner: string;

	constructor(config: GitHubConfig) {
		this.octokit = new Octokit({ auth: config.token });
		this.owner = config.owner;
	}

	async searchCode(
		query: string,
		options?: SearchOptions,
	): Promise<CodeSearchResult> {
		let searchQuery = `${query} user:${this.owner}`;

		if (options?.extensions?.length) {
			for (const ext of options.extensions) {
				searchQuery += ` extension:${ext}`;
			}
		}

		if (options?.path) {
			searchQuery += ` path:${options.path}`;
		}

		try {
			const response = await this.octokit.rest.search.code({
				q: searchQuery,
				per_page: options?.maxResults ?? 10,
			});

			const items: FileReference[] = response.data.items.map((item) => ({
				path: item.path,
				repository: item.repository.full_name,
				language: this.inferLanguage(item.name),
				sha: item.sha,
				relevanceScore: item.score,
			}));

			return { totalCount: response.data.total_count, items };
		} catch (error) {
			console.error(`GitHub Search API error for query "${query}":`, error);
			return { totalCount: 0, items: [] };
		}
	}

	async getFileContent(
		repoFullName: string,
		path: string,
		ref?: string,
	): Promise<FileReference> {
		try {
			const [owner, repo] = repoFullName.split("/");
			if (!owner || !repo) {
				throw new Error(
					`Invalid repository format: ${repoFullName}. Expected "owner/repo".`,
				);
			}

			const response = await this.octokit.rest.repos.getContent({
				owner,
				repo,
				path,
				ref,
			});

			const data = response.data;

			if (Array.isArray(data)) {
				throw new Error(`Path "${path}" is a directory, not a file.`);
			}

			if (!("content" in data)) {
				throw new Error(`No content available for "${path}".`);
			}

			const content = Buffer.from(data.content, "base64").toString("utf-8");

			return {
				path: data.path,
				repository: repoFullName,
				language: this.inferLanguage(data.name),
				content,
				sha: data.sha,
			};
		} catch (error) {
			console.error(`GitHub Contents API error for "${path}":`, error);
			throw error;
		}
	}

	async getLastModifier(
		repoFullName: string,
		path: string,
		limit = 3,
	): Promise<DeveloperProfile[]> {
		try {
			const [owner, repo] = repoFullName.split("/");
			if (!owner || !repo) {
				throw new Error(
					`Invalid repository format: ${repoFullName}. Expected "owner/repo".`,
				);
			}

			const response = await this.octokit.rest.repos.listCommits({
				owner,
				repo,
				path,
				per_page: 30,
			});

			const authorMap = new Map<string, DeveloperProfile>();

			for (const commit of response.data) {
				const authorLogin = commit.author?.login ?? "unknown";
				const authorName = commit.commit.author?.name ?? authorLogin;
				const authorEmail = commit.commit.author?.email ?? "";
				const commitDate = commit.commit.author?.date ?? "";

				const existing = authorMap.get(authorLogin);
				if (existing) {
					existing.commitCount += 1;
					if (commitDate > existing.lastCommitDate) {
						existing.lastCommitDate = commitDate;
					}
				} else {
					authorMap.set(authorLogin, {
						githubUsername: authorLogin,
						name: authorName,
						email: authorEmail,
						commitCount: 1,
						lastCommitDate: commitDate,
						recentFiles: [path],
					});
				}
			}

			return Array.from(authorMap.values())
				.sort((a, b) => b.commitCount - a.commitCount)
				.slice(0, limit);
		} catch (error) {
			console.error(`GitHub Commits API error for "${path}":`, error);
			return [];
		}
	}

	private inferLanguage(filename: string): string {
		const ext = filename.split(".").pop()?.toLowerCase();
		const languageMap: Record<string, string> = {
			ts: "TypeScript",
			tsx: "TypeScript",
			js: "JavaScript",
			jsx: "JavaScript",
			py: "Python",
			go: "Go",
			rs: "Rust",
			java: "Java",
			kt: "Kotlin",
			swift: "Swift",
			rb: "Ruby",
			php: "PHP",
			css: "CSS",
			scss: "SCSS",
			html: "HTML",
			json: "JSON",
			yaml: "YAML",
			yml: "YAML",
			md: "Markdown",
			sql: "SQL",
		};
		return languageMap[ext ?? ""] ?? "Unknown";
	}
}
