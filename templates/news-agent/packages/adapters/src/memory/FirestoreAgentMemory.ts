import { randomUUID } from "node:crypto";
import {
	type CollectionReference,
	type DocumentData,
	FieldValue,
	type Firestore,
} from "@google-cloud/firestore";
import type { IAgentMemory } from "@my-assistant/core";

export class FirestoreAgentMemory implements IAgentMemory {
	private readonly collection: CollectionReference<DocumentData>;

	constructor(
		db: Firestore,
		private readonly embedFn: (text: string) => Promise<number[]>,
		collectionName = "agent_memory",
	) {
		this.collection = db.collection(collectionName);
	}

	async store(
		content: string,
		metadata: Record<string, unknown> = {},
	): Promise<void> {
		const embedding = await this.embedFn(content);
		await this.collection.doc(randomUUID()).set({
			content,
			embedding: FieldValue.vector(embedding),
			metadata,
			createdAt: Date.now(),
		});
	}

	async search(query: string, limit = 5): Promise<string[]> {
		const embedding = await this.embedFn(query);
		const vectorQuery = this.collection.findNearest({
			vectorField: "embedding",
			queryVector: embedding,
			limit,
			distanceMeasure: "COSINE",
		});
		const snapshot = await vectorQuery.get();
		return snapshot.docs.map((doc) => doc.data().content as string);
	}

	async recall(limit = 5): Promise<string[]> {
		const snapshot = await this.collection
			.orderBy("createdAt", "desc")
			.limit(limit)
			.get();
		return snapshot.docs.map((doc) => doc.data().content as string);
	}
}
