import type { LanguageModel, Tool } from "ai";
import { ChatAgent, type ChatMessage } from "../agents/ChatAgent/agent";
import { MemoryAgent } from "../agents/MemoryAgent/agent";
import type { IConfigStore } from "../config/types";
import type { IAgentMemory } from "../memory/types";
import type { IChatPlatform } from "../types/chatPlatform";

export interface HandleSlackMessageParams {
	slack: IChatPlatform;
	model: LanguageModel;
	userId?: string;
	channel: string;
	messageTs: string;
	threadTs?: string;
	botName: string;
	memory?: IAgentMemory;
	webSearchTool?: { name: string; instance: Tool };
	configStore?: IConfigStore;
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
	userId,
	channel,
	messageTs,
	threadTs,
	botName,
	memory,
	webSearchTool,
	configStore,
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

	const chatAgent = new ChatAgent(
		model,
		memory,
		slack,
		webSearchTool,
		configStore,
	);
	const result = await chatAgent.generate({
		messages,
		botName,
		userId,
		channel,
		messageTs,
		threadTs,
	});

	console.log(`[ChatAgent] result: sent=${result.sent}`);

	if (!result.sent) return;

	if (memory) {
		const memoryAgent = new MemoryAgent(model, memory);
		await memoryAgent.process({ messages, botResponse: result.text });
	}
}
