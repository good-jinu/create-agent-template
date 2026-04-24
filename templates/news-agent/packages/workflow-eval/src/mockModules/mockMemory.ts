import type { IAgentMemory } from "@my-assistant/core";

export class MockAgentMemory implements IAgentMemory {
	private readonly entries: string[] = [];
	public readonly storedEntries: string[] = [];

	async recall(limit = 5): Promise<string[]> {
		return this.entries.slice(-limit);
	}

	async search(query: string, limit = 5): Promise<string[]> {
		const normalized = query.toLowerCase();
		return this.entries
			.filter((entry) => entry.toLowerCase().includes(normalized))
			.slice(0, limit);
	}

	async store(content: string): Promise<void> {
		this.entries.push(content);
		this.storedEntries.push(content);
	}
}
