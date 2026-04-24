import {
	type CollectionReference,
	type DocumentData,
	FieldValue,
	type Firestore,
} from "@google-cloud/firestore";

function omitUndefined<T extends object>(data: Partial<T>): Partial<T> {
	const entries = Object.entries(data).filter(
		([, value]) => value !== undefined,
	);
	return Object.fromEntries(entries) as Partial<T>;
}

function isEmptyRecord(value: Record<string, unknown>): boolean {
	return Object.keys(value).length === 0;
}

export class FirestoreConfigCollection<T extends object> {
	private readonly collection: CollectionReference<DocumentData>;

	constructor(
		readonly db: Firestore,
		collectionPath: string,
	) {
		this.collection = db.collection(collectionPath);
	}

	async get(documentId: string): Promise<Partial<T> | null> {
		const snapshot = await this.collection.doc(documentId).get();
		if (!snapshot.exists) return null;

		const data = (snapshot.data() ?? {}) as Record<string, unknown>;
		if (isEmptyRecord(data)) return null;
		return data as Partial<T>;
	}

	async merge(documentId: string, data: Partial<T>): Promise<void> {
		const sanitized = omitUndefined(data);
		if (isEmptyRecord(sanitized as Record<string, unknown>)) return;
		await this.collection.doc(documentId).set(sanitized, { merge: true });
	}

	async clearField(documentId: string, field: keyof T): Promise<void> {
		const ref = this.collection.doc(documentId);
		const snapshot = await ref.get();
		if (!snapshot.exists) return;

		await ref.update({
			[field]: FieldValue.delete(),
		} as DocumentData);
	}

	async listIds(): Promise<string[]> {
		const refs = await this.collection.listDocuments();
		return refs.map((ref) => ref.id);
	}
}
