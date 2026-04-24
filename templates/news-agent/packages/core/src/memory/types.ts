export interface MemoryEntry {
	id: string;
	content: string;
	embedding: number[];
	metadata?: Record<string, unknown>;
	createdAt: number;
}

export interface IMemoryStore {
	store(entry: MemoryEntry): Promise<void>;
	search(queryEmbedding: number[], limit?: number): Promise<MemoryEntry[]>;
	getRecent(limit?: number): Promise<MemoryEntry[]>;
}

/** High-level text-in/text-out memory interface for agents. */
export interface IAgentMemory {
	recall(limit?: number): Promise<string[]>;
	search(query: string, limit?: number): Promise<string[]>;
	store(content: string, metadata?: Record<string, unknown>): Promise<void>;
}
