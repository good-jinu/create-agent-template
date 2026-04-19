import { randomUUID } from "node:crypto";
import type { IAgentMemory } from "@my-ai-agent/core";
import type { ChromaClient, Collection } from "chromadb";

export class ChromaAgentMemory implements IAgentMemory {
	private collection: Collection | null = null;

	constructor(
		private readonly client: ChromaClient,
		private readonly embedFn: (text: string) => Promise<number[]>,
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

	async store(
		content: string,
		metadata: Record<string, unknown> = {},
	): Promise<void> {
		const collection = await this.getCollection();
		const embedding = await this.embedFn(content);
		await collection.upsert({
			ids: [randomUUID()],
			embeddings: [embedding],
			documents: [content],
			metadatas: [{ ...metadata, createdAt: Date.now() }],
		});
	}

	async search(query: string, limit = 5): Promise<string[]> {
		const collection = await this.getCollection();
		const count = await collection.count();
		if (count === 0) return [];

		const embedding = await this.embedFn(query);
		const results = await collection.query({
			queryEmbeddings: [embedding],
			nResults: Math.min(limit, count),
			include: ["documents"],
		});
		return (results.documents[0]?.filter(Boolean) as string[]) ?? [];
	}

	async recall(limit = 5): Promise<string[]> {
		const collection = await this.getCollection();
		const count = await collection.count();
		if (count === 0) return [];

		const results = await collection.get({
			limit: Math.min(limit * 3, count),
			include: ["documents", "metadatas"],
		});

		const entries = results.ids.map((_, i) => ({
			content: results.documents[i] ?? "",
			createdAt: (results.metadatas[i]?.createdAt as number) ?? 0,
		}));

		return entries
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, limit)
			.map((e) => e.content)
			.filter(Boolean);
	}
}
