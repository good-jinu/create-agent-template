import type {
	IConfigStore,
	NewsArticle,
	NewsConfig,
	UserPreferencesConfig,
} from "@my-assistant/core";

export class MockConfigStore implements IConfigStore {
	private readonly userPreferences = new Map<string, UserPreferencesConfig>();
	private readonly newsConfig = new Map<string, NewsConfig>();

	constructor(initial?: {
		userPreferences?: Record<string, UserPreferencesConfig>;
		newsConfig?: Record<string, NewsConfig>;
	}) {
		for (const [userId, config] of Object.entries(
			initial?.userPreferences ?? {},
		)) {
			this.userPreferences.set(userId, config);
		}
		for (const [channelId, config] of Object.entries(
			initial?.newsConfig ?? {},
		)) {
			this.newsConfig.set(channelId, config);
		}
	}

	async getUserPreferences(
		userId: string,
	): Promise<UserPreferencesConfig | null> {
		return this.userPreferences.get(userId) ?? null;
	}

	async setUserLanguage(userId: string, language: string): Promise<void> {
		this.userPreferences.set(userId, {
			...(this.userPreferences.get(userId) ?? {}),
			language,
		});
	}

	async clearUserLanguage(userId: string): Promise<void> {
		const current = this.userPreferences.get(userId);
		if (!current) return;
		delete current.language;
		this.userPreferences.set(userId, current);
	}

	async setUserSpeechStyle(userId: string, speechStyle: string): Promise<void> {
		this.userPreferences.set(userId, {
			...(this.userPreferences.get(userId) ?? {}),
			speechStyle,
		});
	}

	async clearUserSpeechStyle(userId: string): Promise<void> {
		const current = this.userPreferences.get(userId);
		if (!current) return;
		delete current.speechStyle;
		this.userPreferences.set(userId, current);
	}

	async getNewsConfig(channelId: string): Promise<NewsConfig | null> {
		return this.newsConfig.get(channelId) ?? null;
	}

	async setNewsKeywords(channelId: string, keywords: string[]): Promise<void> {
		this.newsConfig.set(channelId, {
			...(this.newsConfig.get(channelId) ?? {}),
			keywords,
		});
	}

	async clearNewsKeywords(channelId: string): Promise<void> {
		const current = this.newsConfig.get(channelId);
		if (!current) return;
		delete current.keywords;
		this.newsConfig.set(channelId, current);
	}

	async setNewsSortBy(
		channelId: string,
		sortBy: "relevancy" | "popularity" | "publishedAt",
	): Promise<void> {
		this.newsConfig.set(channelId, {
			...(this.newsConfig.get(channelId) ?? {}),
			sortBy,
		});
	}

	async clearNewsSortBy(channelId: string): Promise<void> {
		const current = this.newsConfig.get(channelId);
		if (!current) return;
		delete current.sortBy;
		this.newsConfig.set(channelId, current);
	}

	async setNewsOutputLanguage(
		channelId: string,
		outputLanguage: string,
	): Promise<void> {
		this.newsConfig.set(channelId, {
			...(this.newsConfig.get(channelId) ?? {}),
			outputLanguage,
		});
	}

	async clearNewsOutputLanguage(channelId: string): Promise<void> {
		const current = this.newsConfig.get(channelId);
		if (!current) return;
		delete current.outputLanguage;
		this.newsConfig.set(channelId, current);
	}

	async getActiveChannels(): Promise<string[]> {
		return Array.from(this.newsConfig.keys());
	}

	async setHourlySchedules(
		channelId: string,
		schedules: Record<string, NewsArticle>,
	): Promise<void> {
		this.newsConfig.set(channelId, {
			...(this.newsConfig.get(channelId) ?? {}),
			hourlySchedules: schedules,
			lastPlannedAt: new Date().toISOString(),
		});
	}
}
