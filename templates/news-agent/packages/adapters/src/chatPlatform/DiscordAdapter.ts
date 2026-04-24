import type { IChatPlatform } from "@my-assistant/core";

// Minimal interface for what we need from a Discord client (discord.js compatible)
export interface IDiscordClient {
	user: { id: string } | null;
	users: {
		fetch(userId: string): Promise<{ displayName?: string; username: string }>;
	};
	channels: {
		fetch(channelId: string): Promise<IDiscordTextChannel | null>;
	};
}

export interface IDiscordTextChannel {
	messages: {
		fetch(
			options: { limit?: number } | string,
		): Promise<
			Map<string, { author: { id: string }; content: string; id: string }>
		>;
	};
	send(content: string): Promise<{ id: string }>;
	sendTyping(): Promise<void>;
}

export class DiscordAdapter implements IChatPlatform {
	constructor(private readonly client: IDiscordClient) {}

	async getBotUserId(): Promise<string> {
		return this.client.user?.id ?? "";
	}

	async getUserName(userId: string): Promise<string> {
		try {
			const user = await this.client.users.fetch(userId);
			return user.displayName ?? user.username;
		} catch {
			return userId;
		}
	}

	async resolveMentions(text: string): Promise<string> {
		const mentionRegex = /<@!?(\d+)>/g;
		const matches = [...text.matchAll(mentionRegex)];
		if (matches.length === 0) return text;

		const botId = await this.getBotUserId();
		const uniqueIds = [...new Set(matches.map((m) => m[1]))];
		const nameMap = new Map<string, string>();

		await Promise.all(
			uniqueIds.map(async (id) => {
				if (id === botId) {
					nameMap.set(id, "(Self)");
					return;
				}
				nameMap.set(id, await this.getUserName(id));
			}),
		);

		return text.replace(mentionRegex, (_match, id) => {
			return `@${nameMap.get(id) ?? id}`;
		});
	}

	async getRecentMessages(
		channel: string,
		limit = 20,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		const ch = await this.client.channels.fetch(channel);
		if (!ch) return [];
		const messages = await ch.messages.fetch({ limit });
		return [...messages.values()].map((m) => ({
			user: m.author.id,
			text: m.content,
			ts: m.id,
		}));
	}

	async getThreadMessages(
		_channel: string,
		threadTs: string,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		// In Discord, threads are separate channels; threadTs is the thread channel ID
		const thread = await this.client.channels.fetch(threadTs);
		if (!thread) return [];
		const messages = await thread.messages.fetch({ limit: 100 });
		return [...messages.values()].map((m) => ({
			user: m.author.id,
			text: m.content,
			ts: m.id,
		}));
	}

	async addReaction(
		_channel: string,
		_timestamp: string,
		_emoji: string,
	): Promise<void> {
		// Requires fetching the message by ID within the channel using the full discord.js API
		// Implement with: channel.messages.fetch(timestamp) then message.react(emoji)
	}

	async sendThreadMessage(
		_channel: string,
		threadTs: string,
		text: string,
	): Promise<void> {
		// In Discord, threadTs is the thread channel ID
		const thread = await this.client.channels.fetch(threadTs);
		await thread?.send(text);
	}

	async sendMessage(channel: string, text: string): Promise<void> {
		const ch = await this.client.channels.fetch(channel);
		await ch?.send(text);
	}

	async searchMessages(_query: string): Promise<string[]> {
		// Discord does not expose a server-side search API for bots
		return [];
	}
}
