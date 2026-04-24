import type { IChatPlatform } from "@my-assistant/core";

type ChatMessage = { user: string; text: string; ts: string };
export type MockChatMessageRecord =
	| {
			type: "message";
			channel: string;
			text: string;
	  }
	| {
			type: "thread";
			channel: string;
			threadTs: string;
			text: string;
	  };

export type MockReactionRecord = {
	channel: string;
	timestamp: string;
	emoji: string;
};

export class MockChatPlatform implements IChatPlatform {
	private botUserId = "UBOT0000001";
	private readonly messagesByChannel = new Map<string, ChatMessage[]>();
	private readonly threadMessages = new Map<string, ChatMessage[]>();
	private readonly userNames = new Map<string, string>();
	public readonly sentMessages: MockChatMessageRecord[] = [];
	public readonly reactions: MockReactionRecord[] = [];

	constructor(options: {
		botUserId?: string;
		messagesByChannel: Record<string, ChatMessage[]>;
		threadMessages?: Record<string, ChatMessage[]>;
		userNames?: Record<string, string>;
	}) {
		this.botUserId = options.botUserId ?? this.botUserId;
		for (const [channel, messages] of Object.entries(
			options.messagesByChannel,
		)) {
			this.messagesByChannel.set(channel, messages);
		}
		for (const [threadTs, messages] of Object.entries(
			options.threadMessages ?? {},
		)) {
			this.threadMessages.set(threadTs, messages);
		}
		for (const [userId, userName] of Object.entries(options.userNames ?? {})) {
			this.userNames.set(userId, userName);
		}
	}

	async getRecentMessages(
		channel: string,
		limit = 20,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		return (this.messagesByChannel.get(channel) ?? []).slice(-limit);
	}

	async getThreadMessages(
		channel: string,
		threadTs: string,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		const thread = this.threadMessages.get(threadTs);
		if (thread) return thread;
		return (this.messagesByChannel.get(channel) ?? []).filter(
			(message) => message.ts === threadTs,
		);
	}

	async getBotUserId(): Promise<string> {
		return this.botUserId;
	}

	async getUserName(userId: string): Promise<string> {
		return this.userNames.get(userId) ?? userId;
	}

	async resolveMentions(text: string): Promise<string> {
		return text.replace(/<@([UW][A-Z0-9]+)>/g, (_match, userId: string) => {
			return `@${this.userNames.get(userId) ?? userId}`;
		});
	}

	async addReaction(
		channel: string,
		timestamp: string,
		emoji: string,
	): Promise<void> {
		this.reactions.push({ channel, timestamp, emoji });
		console.log(
			`[MockSlack] reaction channel=${channel} ts=${timestamp} emoji=${emoji}`,
		);
	}

	async sendThreadMessage(
		channel: string,
		threadTs: string,
		text: string,
	): Promise<void> {
		this.sentMessages.push({ type: "thread", channel, threadTs, text });
		console.log(
			`[MockSlack] thread channel=${channel} ts=${threadTs}\n${text}`,
		);
	}

	async sendMessage(channel: string, text: string): Promise<void> {
		this.sentMessages.push({ type: "message", channel, text });
		console.log(`[MockSlack] message channel=${channel}\n${text}`);
	}

	async searchMessages(query: string): Promise<string[]> {
		const haystack = [...this.messagesByChannel.values()].flat();
		return haystack
			.filter((message) =>
				message.text.toLowerCase().includes(query.toLowerCase()),
			)
			.map((message) => `${message.user}: ${message.text}`);
	}
}
