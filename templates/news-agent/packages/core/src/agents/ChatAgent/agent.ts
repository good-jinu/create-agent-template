import { generateText, type LanguageModel, stepCountIs, type Tool } from "ai";
import type { IConfigStore } from "../../config/types";
import type { IAgentMemory } from "../../memory/types";
import type { IChatPlatform } from "../../types/chatPlatform";
import { CHAT_PROMPT } from "./prompt";
import {
	createConfigTools,
	createMemoryTools,
	createSlackTools,
	createWebSearchTool,
} from "./tools";

export interface ChatMessage {
	userName: string;
	text: string;
	ts: string;
}

export class ChatAgent {
	constructor(
		private readonly model: LanguageModel,
		private readonly memory?: IAgentMemory,
		private readonly slack?: IChatPlatform,
		private readonly webSearch?: { name: string; instance: Tool },
		private readonly configStore?: IConfigStore,
	) {}

	async generate(params: {
		messages: ChatMessage[];
		botName: string;
		userId?: string;
		channel: string;
		messageTs: string;
		threadTs?: string;
	}): Promise<{ text: string; sent: boolean }> {
		const contextText = params.messages
			.map((m) => `${m.userName}: ${m.text}`)
			.join("\n");

		let coreMemory = "";
		if (this.memory) {
			const recent = await this.memory.recall(5);
			if (recent.length > 0) {
				coreMemory = `\n\n## Past Context (semantic summaries)\n${recent.map((m) => `- ${m}`).join("\n")}`;
			}
		}

		const userPreferences =
			this.configStore && params.userId
				? await this.configStore.getUserPreferences(params.userId)
				: null;

		const userPreferenceLines: string[] = [];
		if (userPreferences?.language) {
			userPreferenceLines.push(
				`- Preferred language: ${userPreferences.language}`,
			);
		}
		if (userPreferences?.speechStyle) {
			userPreferenceLines.push(
				`- Speech style: ${userPreferences.speechStyle}`,
			);
		}

		const prompt = `## Agent Identity
Name: ${params.botName}

${userPreferenceLines.length > 0 ? `## User Preferences\n${userPreferenceLines.join("\n")}\n` : ""}
## Conversation History
${contextText}

---

Generate a helpful response for the user. You can use tools to interact with Slack (send messages, add reactions), search for information, and manage configuration for the current user and channel when needed.`;

		const tools: Record<string, Tool> = {
			...(this.memory ? createMemoryTools(this.memory) : {}),
			...(this.slack
				? createSlackTools(this.slack, {
						channel: params.channel,
						messageTs: params.messageTs,
						threadTs: params.threadTs,
					})
				: {}),
			...(this.webSearch ? createWebSearchTool(this.webSearch) : {}),
			...(this.configStore
				? createConfigTools({
						configStore: this.configStore,
						userId: params.userId,
						channelId: params.channel,
					})
				: {}),
		};

		const result = await generateText({
			model: this.model,
			prompt,
			system: CHAT_PROMPT + coreMemory,
			tools,
			stopWhen: stepCountIs(5),
		});

		const allToolCalls = result.steps.flatMap((s) => s.toolCalls);
		const sentMessage = allToolCalls.find(
			(tc) => tc.toolName === "sendMessage",
		);
		console.log(
			`[ChatAgent] steps=${result.steps.length} totalToolCalls=${allToolCalls.length} sentViaTool=${!!sentMessage} finalText=${JSON.stringify(result.text?.slice(0, 100))}`,
		);
		if (allToolCalls.length > 0) {
			console.log(
				`[ChatAgent] toolCalls=${JSON.stringify(allToolCalls.map((tc) => ({ name: tc.toolName, args: tc.input })))}`,
			);
		}
		if (sentMessage) {
			const args = sentMessage.input as { text?: string };
			return { text: args.text || result.text || "", sent: true };
		}
		return { text: "", sent: false };
	}
}
