import type { IMemoryStore, MemoryEntry } from "@my-ai-agent/core";
import type { ChromaClient, Collection } from "chromadb";

export class ChromaMemoryAdapter implements IMemoryStore {
	private collection: Collection | null = null;

	constructor(
		private readonly client: ChromaClient,
		private readonly collectionName = "agent_memory",
	) {}

	private async getCollection(): Promise<Collection> {
		if (!this.collection) {
			this.collection = await this.client.getOrCreateCollection({
				name: this.collectionName,
			});
		}
		return this.collection;
	}

	async store(entry: MemoryEntry): Promise<void> {
		const collection = await this.getCollection();
		await collection.upsert({
			ids: [entry.id],
			embeddings: [entry.embedding],
			documents: [entry.content],
			metadatas: [{ ...entry.metadata, createdAt: entry.createdAt }],
		});
	}

	async search(queryEmbedding: number[], limit = 5): Promise<MemoryEntry[]> {
		const collection = await this.getCollection();
		const results = await collection.query({
			queryEmbeddings: [queryEmbedding],
			nResults: limit,
			include: ["embeddings", "documents", "metadatas"],
		});

		const ids = results.ids[0] ?? [];
		const documents = results.documents[0] ?? [];
		const embeddings = results.embeddings?.[0] ?? [];
		const metadatas = results.metadatas[0] ?? [];

		return ids.map((id, i) => ({
			id,
			content: documents[i] ?? "",
			embedding: (embeddings[i] as number[]) ?? [],
			metadata: (metadatas[i] as Record<string, unknown>) ?? {},
			createdAt: (metadatas[i]?.createdAt as number) ?? 0,
		}));
	}

	async getRecent(limit = 10): Promise<MemoryEntry[]> {
		const collection = await this.getCollection();
		const count = await collection.count();
		if (count === 0) return [];

		const results = await collection.get({
			limit,
			include: ["embeddings", "documents", "metadatas"],
		});

		const entries: MemoryEntry[] = results.ids.map((id, i) => ({
			id,
			content: results.documents[i] ?? "",
			embedding: (results.embeddings?.[i] as number[]) ?? [],
			metadata: (results.metadatas[i] as Record<string, unknown>) ?? {},
			createdAt: (results.metadatas[i]?.createdAt as number) ?? 0,
		}));

		return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
	}
}
