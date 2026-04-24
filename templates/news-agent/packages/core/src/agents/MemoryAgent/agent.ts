import { generateText, hasToolCall, type LanguageModel, stepCountIs } from "ai";
import type { IAgentMemory } from "../../memory/types";
import type { ChatMessage } from "../ChatAgent/agent";
import { MEMORY_PROMPT } from "./prompt";
import { createMemoryTools } from "./tools";

export class MemoryAgent {
	constructor(
		private readonly model: LanguageModel,
		private readonly memory: IAgentMemory,
	) {}

	async process(params: {
		messages: ChatMessage[];
		botResponse: string | null;
	}): Promise<void> {
		const contextText = params.messages
			.map((m) => `${m.userName}: ${m.text}`)
			.join("\n");

		const searchQuery = contextText.slice(0, 300);
		const existing = await this.memory.search(searchQuery, 3);

		const existingSection =
			existing.length > 0
				? `## Existing Memory (already stored)\n${existing.map((e) => `- ${e}`).join("\n")}`
				: "## Existing Memory\nNone.";

		const prompt = `${existingSection}

## Conversation
${contextText}${params.botResponse ? `\n\nAssistant responded: ${params.botResponse}` : ""}

---

Think through whether this exchange contains new information worth storing. If it does, call submitMemoryDecision with a concise summary. If not, call it with should_store: false.`;

		let submitted = false;

		const tools = createMemoryTools({
			memory: this.memory,
			onDecision: async (shouldStore, summary) => {
				submitted = true;
				if (shouldStore && summary) {
					await this.memory.store(summary);
					console.log(`[MemoryAgent stored]: ${summary}`);
				}
			},
		});

		const firstResult = await generateText({
			model: this.model,
			system: MEMORY_PROMPT,
			prompt,
			tools,
			stopWhen: [hasToolCall("submitMemoryDecision"), stepCountIs(3)],
		});

		if (!submitted) {
			await generateText({
				model: this.model,
				system: MEMORY_PROMPT,
				messages: [
					{ role: "user", content: prompt },
					...firstResult.response.messages,
					{
						role: "user",
						content:
							"You must call submitMemoryDecision now to complete your task.",
					},
				],
				tools,
				stopWhen: [hasToolCall("submitMemoryDecision"), stepCountIs(1)],
			});
		}
	}
}
