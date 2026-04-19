import { generateText, type LanguageModel } from "ai";
import type { IAgentMemory } from "../../memory/types.js";
import type { ChatMessage } from "../DecisionAgent/agent.js";
import { MEMORY_PROMPT } from "./prompt.js";

interface MemoryDecision {
	should_store: boolean;
	summary: string | null;
}

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

Decide whether this exchange contains new information worth storing.`;

		const result = await generateText({
			model: this.model,
			system: MEMORY_PROMPT,
			prompt,
		});

		const decision = this.parseDecision(result.text);

		if (decision.should_store && decision.summary) {
			await this.memory.store(decision.summary);
			console.log(`[MemoryAgent stored]: ${decision.summary}`);
		}
	}

	private parseDecision(text: string): MemoryDecision {
		const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
		if (jsonBlockMatch) {
			try {
				return JSON.parse(jsonBlockMatch[1].trim());
			} catch {
				// fall through
			}
		}

		const jsonMatch = text.match(/\{[\s\S]*"should_store"[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[0]);
			} catch {
				// fall through
			}
		}

		return { should_store: false, summary: null };
	}
}
