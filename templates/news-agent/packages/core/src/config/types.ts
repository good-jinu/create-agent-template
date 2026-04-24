import type { NewsArticle } from "../types/news";

export interface UserPreferencesConfig {
	language?: string;
	speechStyle?: string;
}

export interface NewsConfig {
	keywords?: string[];
	sortBy?: "relevancy" | "popularity" | "publishedAt";
	outputLanguage?: string;
	hourlySchedules?: Record<string, NewsArticle>;
	lastPlannedAt?: string;
}

export interface IConfigStore {
	getUserPreferences(userId: string): Promise<UserPreferencesConfig | null>;
	setUserLanguage(userId: string, language: string): Promise<void>;
	clearUserLanguage(userId: string): Promise<void>;
	setUserSpeechStyle(userId: string, speechStyle: string): Promise<void>;
	clearUserSpeechStyle(userId: string): Promise<void>;

	getNewsConfig(channelId: string): Promise<NewsConfig | null>;
	setNewsKeywords(channelId: string, keywords: string[]): Promise<void>;
	clearNewsKeywords(channelId: string): Promise<void>;
	setNewsSortBy(
		channelId: string,
		sortBy: "relevancy" | "popularity" | "publishedAt",
	): Promise<void>;
	clearNewsSortBy(channelId: string): Promise<void>;
	setNewsOutputLanguage(
		channelId: string,
		outputLanguage: string,
	): Promise<void>;
	clearNewsOutputLanguage(channelId: string): Promise<void>;

	getActiveChannels(): Promise<string[]>;
	setHourlySchedules(
		channelId: string,
		schedules: Record<string, NewsArticle>,
	): Promise<void>;
}
