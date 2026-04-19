import {
	type CollectionReference,
	type DocumentData,
	FieldValue,
	type Firestore,
} from "@google-cloud/firestore";
import type { IMemoryStore, MemoryEntry } from "@my-ai-agent/core";

export class FirestoreMemoryAdapter implements IMemoryStore {
	private readonly collection: CollectionReference<DocumentData>;

	constructor(
		private readonly db: Firestore,
		collectionName = "agent_memory",
	) {
		this.collection = db.collection(collectionName);
	}

	async store(entry: MemoryEntry): Promise<void> {
		await this.collection.doc(entry.id).set({
			content: entry.content,
			embedding: FieldValue.vector(entry.embedding),
			metadata: entry.metadata ?? {},
			createdAt: entry.createdAt,
		});
	}

	async search(queryEmbedding: number[], limit = 5): Promise<MemoryEntry[]> {
		const vectorQuery = this.collection.findNearest({
			vectorField: "embedding",
			queryVector: queryEmbedding,
			limit,
			distanceMeasure: "COSINE",
		});

		const snapshot = await vectorQuery.get();
		return snapshot.docs.map((doc) => this.toEntry(doc.id, doc.data()));
	}

	async getRecent(limit = 10): Promise<MemoryEntry[]> {
		const snapshot = await this.collection
			.orderBy("createdAt", "desc")
			.limit(limit)
			.get();
		return snapshot.docs.map((doc) => this.toEntry(doc.id, doc.data()));
	}

	private toEntry(id: string, data: DocumentData): MemoryEntry {
		return {
			id,
			content: data.content,
			// Firestore VectorValue has a toArray() method
			embedding: data.embedding?.toArray?.() ?? [],
			metadata: data.metadata,
			createdAt: data.createdAt,
		};
	}
}
