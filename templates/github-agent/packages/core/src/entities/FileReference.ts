/**
 * FileReference Entity
 *
 * Represents a file discovered during the autonomous code search,
 * along with metadata about its relevance and content.
 */

export interface FileReference {
	/** Full path within the repository (e.g., "src/components/SignupModal.tsx") */
	path: string;
	/** Repository where the file resides */
	repository: string;
	/** Programming language of the file */
	language?: string;
	/** Relevance score (0-1) assigned during search */
	relevanceScore?: number;
	/** Snippet or full content of the file (loaded on demand) */
	content?: string;
	/** SHA of the file at the time of retrieval */
	sha?: string;
}

/**
 * Represents a search result from GitHub Code Search API.
 */
export interface CodeSearchResult {
	/** Total number of results found */
	totalCount: number;
	/** List of matching file references */
	items: FileReference[];
}
