import { type Tool, tool } from "ai";
import { z } from "zod";
import type { IAgentMemory } from "../../memory/types";

export function createMemoryTools(params: {
	memory: IAgentMemory;
	onDecision: (shouldStore: boolean, summary: string | null) => Promise<void>;
}): Record<string, Tool> {
	return {
		submitMemoryDecision: tool({
			description:
				"Submit your decision about whether to store this conversation in long-term memory. Call this once you have finished reasoning.",
			inputSchema: z.object({
				should_store: z.boolean(),
				summary: z
					.string()
					.nullable()
					.describe("Concise summary to store, or null if not storing"),
			}),
			execute: async ({ should_store, summary }) => {
				await params.onDecision(should_store, summary);
				return should_store ? "Stored." : "Nothing stored.";
			},
		}),
	};
}
