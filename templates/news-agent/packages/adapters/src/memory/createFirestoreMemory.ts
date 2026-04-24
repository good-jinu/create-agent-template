import type { Firestore } from "@google-cloud/firestore";
import { type EmbeddingModel, embed } from "ai";
import { FirestoreAgentMemory } from "./FirestoreAgentMemory";

/**
 * Convenience factory that wires an EmbeddingModel into FirestoreAgentMemory.
 * Use this in composition roots so they don't need to import `embed` from "ai" directly.
 */
export function createFirestoreMemory(
	db: Firestore,
	embeddingModel: EmbeddingModel,
	collectionName?: string,
): FirestoreAgentMemory {
	const embedFn = (text: string) =>
		embed({ model: embeddingModel, value: text }).then((r) => r.embedding);
	return new FirestoreAgentMemory(db, embedFn, collectionName);
}
