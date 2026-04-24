import type { IChatPlatform } from "@my-assistant/core";
import type { App } from "@slack/bolt";

function mdToMrkdwn(text: string): string {
	return (
		text
			// Headings: # Foo → *Foo*
			.replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
			// Bold (**text** or __text__): protect with STX/ETX before italic pass
			.replace(/\*\*(.+?)\*\*/gs, "\x02$1\x03")
			.replace(/__(.+?)__/gs, "\x02$1\x03")
			// Italic: remaining *text* (no * inside) → _text_
			.replace(/\*([^*\n]+?)\*/g, "_$1_")
			// Restore bold markers as mrkdwn *
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally using control characters for markers.
			.replace(/\x02(.+?)\x03/gs, "*$1*")
			// Strikethrough: ~~text~~ → ~text~
			.replace(/~~(.+?)~~/gs, "~$1~")
			// Links: [text](url) → <url|text>
			.replace(/\[(.+?)\]\((.+?)\)/g, "<$2|$1>")
	);
}

export interface MessageContext {
	channelId: string;
	messageTs: string;
	userId: string;
	text: string;
}

export class SlackAdapter implements IChatPlatform {
	private readonly botToken: string;
	private botUserId?: string;

	constructor(
		private readonly app: App,
		botToken: string,
	) {
		this.botToken = botToken;
	}

	async getBotUserId(): Promise<string> {
		if (this.botUserId) return this.botUserId;
		const result = await this.app.client.auth.test({
			token: this.botToken,
		});
		this.botUserId = result.user_id || "";
		return this.botUserId;
	}

	async addReaction(
		channel: string,
		timestamp: string,
		emoji: string,
	): Promise<void> {
		try {
			await this.app.client.reactions.add({
				token: this.botToken,
				channel,
				timestamp,
				name: emoji,
			});
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				(error as { data?: { error?: string } }).data?.error ===
					"already_reacted"
			) {
				return;
			}
			throw error;
		}
	}

	async removeReaction(
		channel: string,
		timestamp: string,
		emoji: string,
	): Promise<void> {
		try {
			await this.app.client.reactions.remove({
				token: this.botToken,
				channel,
				timestamp,
				name: emoji,
			});
		} catch {
			// Ignore if reaction doesn't exist
		}
	}

	async sendThreadMessage(
		channel: string,
		threadTs: string,
		text: string,
	): Promise<void> {
		await this.app.client.chat.postMessage({
			token: this.botToken,
			channel,
			thread_ts: threadTs,
			text: mdToMrkdwn(text),
		});
	}

	async sendMessage(channel: string, text: string): Promise<void> {
		await this.app.client.chat.postMessage({
			token: this.botToken,
			channel,
			text: mdToMrkdwn(text),
		});
	}

	async getRecentMessages(
		channel: string,
		limit = 20,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		const result = await this.app.client.conversations.history({
			token: this.botToken,
			channel,
			limit,
		});

		return (result.messages || []).map((m) => ({
			user: m.user || "unknown",
			text: m.text || "",
			ts: m.ts || "",
		}));
	}

	async getThreadMessages(
		channel: string,
		threadTs: string,
	): Promise<Array<{ user: string; text: string; ts: string }>> {
		const result = await this.app.client.conversations.replies({
			token: this.botToken,
			channel,
			ts: threadTs,
		});

		return (result.messages || []).map((m) => ({
			user: m.user || "unknown",
			text: m.text || "",
			ts: m.ts || "",
		}));
	}

	async getUserName(userId: string): Promise<string> {
		try {
			const result = await this.app.client.users.info({
				token: this.botToken,
				user: userId,
			});
			return result.user?.real_name || result.user?.name || userId;
		} catch {
			return userId;
		}
	}

	async resolveMentions(text: string): Promise<string> {
		const botId = await this.getBotUserId();
		const mentionRegex = /<@([UW][A-Z0-9]+)>/g;
		const matches = [...text.matchAll(mentionRegex)];
		if (matches.length === 0) return text;

		const uniqueIds = [...new Set(matches.map((m) => m[1]))];
		const nameMap = new Map<string, string>();

		await Promise.all(
			uniqueIds.map(async (id) => {
				if (id === botId) {
					nameMap.set(id, "(Self)");
					return;
				}
				const name = await this.getUserName(id);
				nameMap.set(id, name);
			}),
		);

		return text.replace(mentionRegex, (_match, id) => {
			const name = nameMap.get(id) || id;
			return name === "(Self)" ? `@${name}` : `@${name}`;
		});
	}

	async searchMessages(query: string): Promise<string[]> {
		try {
			const result = await this.app.client.search.messages({
				token: this.botToken,
				query,
			});
			return (result.messages?.matches || []).map(
				(m) => `[${m.channel?.name || "unknown"}] ${m.username}: ${m.text}`,
			);
		} catch (error) {
			console.error("Slack search failed:", error);
			return [];
		}
	}
}
