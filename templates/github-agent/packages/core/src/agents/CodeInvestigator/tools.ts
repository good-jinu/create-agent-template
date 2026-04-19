import { z } from "zod/v4";
import type { DeveloperProfile } from "../../entities/DeveloperProfile.js";
import type {
	CodeSearchResult,
	FileReference,
} from "../../entities/FileReference.js";
import type { ToolDefinition } from "./types.js";

export interface SearchOptions {
	extensions?: string[];
	path?: string;
	maxResults?: number;
}

export interface IRepositoryService {
	searchCode(query: string, options?: SearchOptions): Promise<CodeSearchResult>;
	getFileContent(
		repo: string,
		path: string,
		ref?: string,
	): Promise<FileReference>;
	getLastModifier(
		repo: string,
		path: string,
		limit?: number,
	): Promise<DeveloperProfile[]>;
}

export function buildRepositoryTools(
	repoService: IRepositoryService,
): ToolDefinition[] {
	return [
		{
			name: "searchCode",
			description:
				"Search the codebase by keyword. Use this to find files related to a feature, component, or concept. " +
				"Returns file paths and relevance information. Use specific keywords like class names, function names, or module names.",
			parameters: z.object({
				query: z
					.string()
					.describe(
						"The search keyword (e.g., 'SignupModal', 'auth middleware', 'payment processing')",
					),
				extensions: z
					.array(z.string())
					.optional()
					.describe("Optional file extensions to filter (e.g., ['ts', 'tsx'])"),
				path: z
					.string()
					.optional()
					.describe(
						"Optional directory path to scope the search (e.g., 'src/components')",
					),
			}),
			execute: async (args) => {
				const { query, extensions, path } = args as {
					query: string;
					extensions?: string[];
					path?: string;
				};
				const result = await repoService.searchCode(query, {
					extensions,
					path,
					maxResults: 10,
				});
				return {
					totalCount: result.totalCount,
					files: result.items.map((item: FileReference) => ({
						repo: item.repository,
						path: item.path,
						language: item.language,
					})),
				};
			},
		},
		{
			name: "getFileContent",
			description:
				"Retrieve the full content of a specific file from the repository. " +
				"Use this after searching to read and understand the implementation details of a file.",
			parameters: z.object({
				repo: z
					.string()
					.describe(
						"The repository full name (e.g., 'your-org/your-repo') returned from the search step.",
					),
				path: z
					.string()
					.describe(
						"The file path within the repository (e.g., 'src/components/SignupModal.tsx')",
					),
			}),
			execute: async (args) => {
				const { repo, path } = args as { repo: string; path: string };
				const file = await repoService.getFileContent(repo, path);
				return {
					repo: file.repository,
					path: file.path,
					language: file.language,
					content: file.content,
				};
			},
		},
		{
			name: "getLastModifier",
			description:
				"Find out who recently modified a specific file. " +
				"Returns the developer name, email, and recent commit count. " +
				"Use this to identify the code owner for a file.",
			parameters: z.object({
				repo: z
					.string()
					.describe(
						"The repository full name (e.g., 'your-org/your-repo') returned from the search step.",
					),
				path: z
					.string()
					.describe("The file path to look up recent modifiers for"),
			}),
			execute: async (args) => {
				const { repo, path } = args as { repo: string; path: string };
				const modifiers = await repoService.getLastModifier(repo, path, 3);
				return modifiers.map((dev) => ({
					name: dev.name,
					githubUsername: dev.githubUsername,
					commitCount: dev.commitCount,
					lastCommitDate: dev.lastCommitDate,
				}));
			},
		},
	];
}
