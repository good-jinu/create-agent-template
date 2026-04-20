import type { LanguageModel, Tool } from "ai";
import { ChatAgent } from "../agents/ChatAgent/agent.js";
import {
	type ChatMessage,
	DecisionAgent,
} from "../agents/DecisionAgent/agent.js";
import { MemoryAgent } from "../agents/MemoryAgent/agent.js";
import type { IAgentMemory } from "../memory/types.js";
import type { ISlackMessaging } from "../types/slack.js";

export interface HandleSlackMessageParams {
	slack: ISlackMessaging;
	model: LanguageModel;
	channel: string;
	messageTs: string;
	threadTs?: string;
	botName: string;
	memory?: IAgentMemory;
	webSearchTool?: { name: string; instance: Tool };
}

const MAX_CHARS = 20_000;

function truncateToLatest(messages: ChatMessage[]): ChatMessage[] {
	let total = 0;
	const kept: ChatMessage[] = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const len = messages[i].userName.length + 2 + messages[i].text.length; // "name: text"
		if (total + len > MAX_CHARS && kept.length > 0) break;
		kept.unshift(messages[i]);
		total += len;
	}
	return kept;
}

export async function handleSlackMessage({
	slack,
	model,
	channel,
	messageTs,
	threadTs,
	botName,
	memory,
	webSearchTool,
}: HandleSlackMessageParams): Promise<void> {
	// Fetch thread if the message is inside one, otherwise just the single message.
	const isThread = threadTs !== undefined;
	const rawMessages = isThread
		? await slack.getThreadMessages(channel, threadTs)
		: await slack.getRecentMessages(channel, 1);

	const resolved: ChatMessage[] = await Promise.all(
		rawMessages.map(async (m) => ({
			userName: await slack.getUserName(m.user),
			text: await slack.resolveMentions(m.text),
			ts: m.ts,
		})),
	);

	for (const msg of resolved) {
		console.log(`[Resolved Message] ${msg.userName}: ${msg.text}`);
	}

	const messages = truncateToLatest(resolved);

	const decisionAgent = new DecisionAgent(model, memory, slack, webSearchTool);
	const decision = await decisionAgent.decide({
		messages,
		botName,
	});

	console.log(`[Reasoning]: ${decision.reasoning}`);

	if (!decision.should_respond) return;

	// Handle simple emoji reaction immediately if it's the decided response type
	if (decision.response_type === "emoji" && decision.emoji) {
		await slack.addReaction(
			channel,
			messageTs,
			decision.emoji.replace(/^:|:$/g, ""),
		);
		if (memory) {
			const memoryAgent = new MemoryAgent(model, memory);
			await memoryAgent.process({
				messages,
				botResponse: `[Decision reasoning: ${decision.reasoning} - Reacted with emoji: ${decision.emoji}]`,
			});
		}
		return;
	}

	const chatAgent = new ChatAgent(model, memory, slack, webSearchTool);
	const botResponse = await chatAgent.generate({
		messages,
		botName,
		channel,
		messageTs,
		threadTs,
		reasoning: decision.reasoning,
	});

	if (memory && botResponse) {
		const memoryAgent = new MemoryAgent(model, memory);
		await memoryAgent.process({ messages, botResponse });
	}
}
