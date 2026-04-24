import type { Firestore } from "@google-cloud/firestore";
import type {
	IConfigStore,
	NewsArticle,
	NewsConfig,
	UserPreferencesConfig,
} from "@my-assistant/core";
import { FirestoreConfigCollection } from "./FirestoreConfigCollection";

export class FirestoreConfigStore implements IConfigStore {
	private readonly userConfigCollection: FirestoreConfigCollection<UserPreferencesConfig>;
	private readonly newsConfigCollection: FirestoreConfigCollection<NewsConfig>;
	constructor(db: Firestore) {
		this.userConfigCollection =
			new FirestoreConfigCollection<UserPreferencesConfig>(db, "userConfigs");
		this.newsConfigCollection = new FirestoreConfigCollection<NewsConfig>(
			db,
			"newsConfigs",
		);
	}

	async getUserPreferences(
		userId: string,
	): Promise<UserPreferencesConfig | null> {
		return this.userConfigCollection.get(userId);
	}

	async setUserLanguage(userId: string, language: string): Promise<void> {
		await this.userConfigCollection.merge(userId, { language });
	}

	async clearUserLanguage(userId: string): Promise<void> {
		await this.userConfigCollection.clearField(userId, "language");
	}

	async setUserSpeechStyle(userId: string, speechStyle: string): Promise<void> {
		await this.userConfigCollection.merge(userId, { speechStyle });
	}

	async clearUserSpeechStyle(userId: string): Promise<void> {
		await this.userConfigCollection.clearField(userId, "speechStyle");
	}

	async getNewsConfig(channelId: string): Promise<NewsConfig | null> {
		return this.newsConfigCollection.get(channelId);
	}

	async setNewsKeywords(channelId: string, keywords: string[]): Promise<void> {
		await this.newsConfigCollection.merge(channelId, { keywords });
	}

	async clearNewsKeywords(channelId: string): Promise<void> {
		await this.newsConfigCollection.clearField(channelId, "keywords");
	}

	async setNewsSortBy(
		channelId: string,
		sortBy: "relevancy" | "popularity" | "publishedAt",
	): Promise<void> {
		await this.newsConfigCollection.merge(channelId, { sortBy });
	}

	async clearNewsSortBy(channelId: string): Promise<void> {
		await this.newsConfigCollection.clearField(channelId, "sortBy");
	}

	async setNewsOutputLanguage(
		channelId: string,
		outputLanguage: string,
	): Promise<void> {
		await this.newsConfigCollection.merge(channelId, { outputLanguage });
	}

	async clearNewsOutputLanguage(channelId: string): Promise<void> {
		await this.newsConfigCollection.clearField(channelId, "outputLanguage");
	}

	async getActiveChannels(): Promise<string[]> {
		return this.newsConfigCollection.listIds();
	}

	async setHourlySchedules(
		channelId: string,
		schedules: Record<string, NewsArticle>,
	): Promise<void> {
		await this.newsConfigCollection.merge(channelId, {
			hourlySchedules: schedules,
			lastPlannedAt: new Date().toISOString(),
		});
	}
}
