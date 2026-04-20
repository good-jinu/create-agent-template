import { generateText, type LanguageModel, type Tool, tool } from "ai";
import { z } from "zod";
import type { IAgentMemory } from "../../memory/types.js";
import type { ISlackMessaging } from "../../types/slack.js";
import type { ChatMessage } from "../DecisionAgent/agent.js";
import { CHAT_PROMPT } from "./prompt.js";

export class ChatAgent {
	constructor(
		private readonly model: LanguageModel,
		private readonly memory?: IAgentMemory,
		private readonly slack?: ISlackMessaging,
		private readonly webSearch?: { name: string; instance: Tool },
	) {}

	async generate(params: {
		messages: ChatMessage[];
		botName: string;
		channel: string;
		messageTs: string;
		threadTs?: string;
		reasoning?: string;
	}): Promise<string> {
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

		const prompt = `## Agent Identity
Name: ${params.botName}

${params.reasoning ? `## Decision Reasoning\n${params.reasoning}\n` : ""}

## Conversation History
${contextText}

---

Generate a helpful response for the user. You can use tools to interact with Slack (send messages, add reactions) or search for information.`;

		const tools: Record<string, Tool> = {};

		if (this.memory) {
			tools.memory = tool({
				description: `Read from and search long-term semantic memory.
- recall: get recent context summaries (call this first before deciding)
- search: find summaries relevant to a topic keyword`,
				inputSchema: z.object({
					action: z.enum(["recall", "search"]),
					limit: z
						.number()
						.optional()
						.describe("Max results for recall/search"),
					query: z
						.string()
						.optional()
						.describe("For search: topic keyword to look up"),
				}),
				execute: async ({ action, query, limit }) => {
					if (!this.memory) return "Memory not initialized.";
					if (action === "recall") {
						const results = await this.memory.recall(limit ?? 5);
						return results.length > 0
							? results.join("\n")
							: "No past context found.";
					}
					if (action === "search") {
						if (!query) return "query is required for search";
						const results = await this.memory.search(query, limit ?? 5);
						return results.length > 0
							? results.join("\n")
							: "No matching context found.";
					}
					return "Unknown action.";
				},
			});
		}

		if (this.slack) {
			tools.slackSearch = tool({
				description:
					"Search past Slack messages for specific content or quotes. Use this when you need actual message text, not just topic summaries.",
				inputSchema: z.object({
					query: z.string().describe("Search query for Slack messages"),
				}),
				execute: async ({ query }) => {
					const results = await this.slack?.searchMessages(query);
					return results && results.length > 0
						? results.join("\n")
						: "No messages found.";
				},
			});

			tools.sendMessage = tool({
				description:
					"Send a message to the current Slack channel (always in thread).",
				inputSchema: z.object({
					text: z.string().describe("The message text to send"),
				}),
				execute: async ({ text }) => {
					await this.slack?.sendThreadMessage(
						params.channel,
						params.threadTs ?? params.messageTs,
						text,
					);
					return "Message sent successfully.";
				},
			});

			tools.addReaction = tool({
				description: "Add an emoji reaction to the current message.",
				inputSchema: z.object({
					emoji: z
						.string()
						.describe(
							"The emoji name (without colons, e.g., 'eyes', 'heavy_check_mark')",
						),
				}),
				execute: async ({ emoji }) => {
					await this.slack?.addReaction(
						params.channel,
						params.messageTs,
						emoji.replace(/^:|:$/g, ""),
					);
					return "Reaction added successfully.";
				},
			});
		}

		if (this.webSearch) {
			tools[this.webSearch.name] = this.webSearch.instance;
		}

		const hasTools = Object.keys(tools).length > 0;

		const result = await generateText({
			model: this.model,
			prompt,
			system: CHAT_PROMPT + coreMemory,
			...(hasTools ? { tools, maxSteps: 5 } : {}),
		});

		// Extract the text that was actually sent via tool if possible
		const sentMessage = result.toolCalls.find(
			(tc) => tc.toolName === "sendMessage",
		);

		if (sentMessage) {
			return (sentMessage as any).args?.text || result.text || "";
		}

		return result.text || "";
	}
}
