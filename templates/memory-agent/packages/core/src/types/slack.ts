export interface ISlackMessaging {
	getRecentMessages(
		channel: string,
		limit?: number,
	): Promise<Array<{ user: string; text: string; ts: string }>>;
	getThreadMessages(
		channel: string,
		threadTs: string,
	): Promise<Array<{ user: string; text: string; ts: string }>>;
	getBotUserId(): Promise<string>;
	getUserName(userId: string): Promise<string>;
	resolveMentions(text: string): Promise<string>;
	addReaction(channel: string, timestamp: string, emoji: string): Promise<void>;
	sendThreadMessage(
		channel: string,
		threadTs: string,
		text: string,
	): Promise<void>;
	sendMessage(channel: string, text: string): Promise<void>;
	searchMessages(query: string): Promise<string[]>;
}
