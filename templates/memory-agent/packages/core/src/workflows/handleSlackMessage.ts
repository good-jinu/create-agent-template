import type { LanguageModel } from "ai";
import {
	type ChatMessage,
	DecisionAgent,
} from "../agents/DecisionAgent/agent.js";
import { MemoryAgent } from "../agents/MemoryAgent/agent.js";
import type { IAgentMemory } from "../memory/types.js";

export interface ISlackMessaging {
	getRecentMessages(
		channel: string,
		limit?: number,
	): Promise<Array<{ user: string; text: string; ts: string }>>;
	getThreadMessages(
		channel: string,
		threadTs: string,
	): Promise<Array<{ user: string; text: string; ts: string }>>;
	getUserName(userId: string): Promise<string>;
	addReaction(channel: string, timestamp: string, emoji: string): Promise<void>;
	sendThreadMessage(
		channel: string,
		threadTs: string,
		text: string,
	): Promise<void>;
	sendMessage(channel: string, text: string): Promise<void>;
	searchMessages(query: string): Promise<string[]>;
}

export interface HandleSlackMessageParams {
	slack: ISlackMessaging;
	model: LanguageModel;
	channel: string;
	messageTs: string;
	threadTs?: string;
	botName: string;
	teamContext: string;
	memory?: IAgentMemory;
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
	teamContext,
	memory,
}: HandleSlackMessageParams): Promise<void> {
	// Fetch thread if the message is inside one, otherwise just the single message.
	const isThread = threadTs !== undefined;
	const rawMessages = isThread
		? await slack.getThreadMessages(channel, threadTs)
		: await slack.getRecentMessages(channel, 1);

	const resolved: ChatMessage[] = await Promise.all(
		rawMessages.map(async (m) => ({
			userName: await slack.getUserName(m.user),
			text: m.text,
			ts: m.ts,
		})),
	);

	const messages = truncateToLatest(resolved);

	const decisionAgent = new DecisionAgent(model, memory, slack);
	const decision = await decisionAgent.decide({
		messages,
		botName,
		teamContext,
	});

	console.log(`[Reasoning]: ${decision.reasoning}`);

	if (!decision.should_respond) return;

	if (decision.response_type === "emoji" && decision.emoji) {
		await slack.addReaction(channel, messageTs, decision.emoji.replace(/:/g, ""));
	} else if (decision.content) {
		await slack.sendThreadMessage(channel, threadTs ?? messageTs, decision.content);
	}

	if (memory) {
		const memoryAgent = new MemoryAgent(model, memory);
		await memoryAgent.process({ messages, botResponse: decision.content });
	}
}
