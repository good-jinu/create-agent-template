import { generateText, type LanguageModel, tool } from "ai";
import { z } from "zod/v4";
import type { IAgentMemory } from "../../memory/types.js";
import { DECISION_PROMPT } from "./prompt.js";

export interface ChatMessage {
	userName: string;
	text: string;
	ts: string;
}

export interface Decision {
	should_respond: boolean;
	response_type: "thread" | "channel" | "emoji" | "ignore";
	reasoning: string;
	content: string | null;
	emoji: string | null;
}

export interface ISlackSearch {
	searchMessages(query: string): Promise<string[]>;
}

export class DecisionAgent {
	constructor(
		private readonly model: LanguageModel,
		private readonly memory?: IAgentMemory,
		private readonly slack?: ISlackSearch,
	) {}

	async decide(params: {
		messages: ChatMessage[];
		botName: string;
		teamContext: string;
	}): Promise<Decision> {
		const contextText = params.messages
			.map((m) => `${m.userName}: ${m.text}`)
			.join("\n");

		// Inject recent semantic summaries into the system prompt (prepareCall pattern)
		let coreMemory = "";
		if (this.memory) {
			const recent = await this.memory.recall(5);
			if (recent.length > 0) {
				coreMemory = `\n\n## Past Context (semantic summaries)\n${recent.map((m) => `- ${m}`).join("\n")}`;
			}
		}

		const prompt = `## Team Context
${params.teamContext}

## Agent Identity
Name: ${params.botName}

## Current Message
${contextText}

---

Based on the above, decide on the best next action.`;

		const tools: Record<string, ReturnType<typeof tool>> = {};

		if (this.memory) {
			tools.memory = tool({
				description: `Read from and write to long-term semantic memory.
- recall: get recent context summaries (call this first before deciding)
- search: find summaries relevant to a topic keyword
- store: save a concise semantic description of what was discussed (NOT raw message text). Call this after deciding to respond, when the topic is worth remembering.`,
				parameters: z.object({
					action: z.enum(["recall", "search", "store"]),
					query: z
						.string()
						.optional()
						.describe("For search: topic keyword to look up"),
					content: z
						.string()
						.optional()
						.describe("For store: semantic description of what was discussed"),
					limit: z
						.number()
						.optional()
						.describe("Max results for recall/search"),
				}),
				execute: async ({ action, query, content, limit }) => {
					const mem = this.memory!;
					if (action === "recall") {
						const results = await mem.recall(limit ?? 5);
						return results.length > 0
							? results.join("\n")
							: "No past context found.";
					}
					if (action === "search") {
						if (!query) return "query is required for search";
						const results = await mem.search(query, limit ?? 5);
						return results.length > 0
							? results.join("\n")
							: "No matching context found.";
					}
					if (action === "store") {
						if (!content) return "content is required for store";
						await mem.store(content);
						return "Stored.";
					}
					return "Unknown action.";
				},
			});
		}

		if (this.slack) {
			tools.slackSearch = tool({
				description:
					"Search past Slack messages for specific content or quotes. Use this when you need actual message text, not just topic summaries.",
				parameters: z.object({
					query: z.string().describe("Search query for Slack messages"),
				}),
				execute: async ({ query }) => {
					const results = await this.slack!.searchMessages(query);
					return results.length > 0 ? results.join("\n") : "No messages found.";
				},
			});
		}

		const hasTools = Object.keys(tools).length > 0;

		const result = await generateText({
			model: this.model,
			prompt,
			system: DECISION_PROMPT + coreMemory,
			...(hasTools ? { tools, maxSteps: 5 } : {}),
		});

		// result.text is only the last step's text; when the final step is a tool
		// call the text may be empty. Search all steps for the JSON response.
		const allStepTexts = result.steps.map((s) => s.text).filter(Boolean);
		const textToSearch = [result.text, ...allStepTexts.reverse()].find(
			(t) => t && (t.includes("should_respond") || t.includes("```json")),
		);

		if (!textToSearch) {
			console.warn("[DecisionAgent] No JSON found in any step. Raw texts:", allStepTexts);
		}

		return this.parseDecision(textToSearch ?? "");
	}

	private parseDecision(text: string): Decision {
		const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
		if (jsonBlockMatch) {
			try {
				return JSON.parse(jsonBlockMatch[1].trim());
			} catch {
				// not valid JSON
			}
		}

		const jsonMatch = text.match(/\{[\s\S]*"should_respond"[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[0]);
			} catch {
				// not valid JSON
			}
		}

		return {
			should_respond: false,
			response_type: "ignore",
			reasoning: "Failed to parse model output as JSON. Defaulting to ignore.",
			content: null,
			emoji: null,
		};
	}
}
