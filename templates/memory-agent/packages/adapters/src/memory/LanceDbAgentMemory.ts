import { randomUUID } from "node:crypto";
import * as lancedb from "@lancedb/lancedb";
import type { IAgentMemory } from "@my-ai-agent/core";

interface MemoryRecord {
	id: string;
	content: string;
	vector: number[];
	createdAt: number;
	metadata: string;
}

export class LanceDbAgentMemory implements IAgentMemory {
	private db: lancedb.Connection | null = null;
	private table: lancedb.Table | null = null;

	constructor(
		private readonly path: string,
		private readonly embedFn: (text: string) => Promise<number[]>,
		private readonly tableName = "agent_memory",
	) {}

	private async connect(): Promise<lancedb.Connection> {
		if (!this.db) {
			this.db = await lancedb.connect(this.path);
		}
		return this.db;
	}

	private async openTable(): Promise<lancedb.Table | null> {
		if (this.table) return this.table;
		const db = await this.connect();
		const names = await db.tableNames();
		if (!names.includes(this.tableName)) return null;
		this.table = await db.openTable(this.tableName);
		return this.table;
	}

	async store(
		content: string,
		metadata: Record<string, unknown> = {},
	): Promise<void> {
		const db = await this.connect();
		const vector = await this.embedFn(content);
		const record: MemoryRecord = {
			id: randomUUID(),
			content,
			vector,
			createdAt: Date.now(),
			metadata: JSON.stringify(metadata),
		};

		const names = await db.tableNames();
		if (names.includes(this.tableName)) {
			const table = await db.openTable(this.tableName);
			await table.add([record as unknown as Record<string, unknown>]);
			this.table = table;
		} else {
			this.table = await db.createTable(this.tableName, [
				record as unknown as Record<string, unknown>,
			]);
		}
	}

	async search(query: string, limit = 5): Promise<string[]> {
		const table = await this.openTable();
		if (!table) return [];
		const vector = await this.embedFn(query);
		const results = await table.search(vector).limit(limit).toArray();
		return results.map((r) => r.content as string);
	}

	async recall(limit = 5): Promise<string[]> {
		const table = await this.openTable();
		if (!table) return [];
		const results = await table
			.query()
			.limit(limit * 5)
			.toArray();
		return (results as MemoryRecord[])
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, limit)
			.map((r) => r.content);
	}
}
