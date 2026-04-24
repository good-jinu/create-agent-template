import { sendNewsSummary } from "@my-assistant/core";
import type {
	MockChatMessageRecord,
	MockReactionRecord,
} from "../mockModules/mockChatPlatform";
import { MockChatPlatform } from "../mockModules/mockChatPlatform";
import { MockConfigStore } from "../mockModules/mockConfigStore";
import { MockNewsProvider } from "../mockModules/mockNewsProvider";
import { MockScraper } from "../mockModules/mockScraper";
import { resolveProvider } from "../utils/provider";
import type { SendNewsSummaryCaseDefinition } from "./definitions";

export interface SendNewsSummaryCaseArtifact {
	kind: "sendNewsSummary";
	id: string;
	outputs: {
		messages: MockChatMessageRecord[];
		reactions: MockReactionRecord[];
	};
	fetchedArticles: import("@my-assistant/core").NewsArticle[];
	scrapedUrls: string[];
}

export async function runSendNewsSummaryCase(
	caseDefinition: SendNewsSummaryCaseDefinition,
): Promise<SendNewsSummaryCaseArtifact> {
	const provider = resolveProvider(caseDefinition.config.provider);
	const slack = new MockChatPlatform({
		botUserId: "UBOT0000001",
		messagesByChannel: {},
		userNames: {},
	});
	const newsProvider = new MockNewsProvider(
		caseDefinition.input
			.filter((row) => row.kind === "news_article")
			.map((row) => ({
				title: row.title,
				description: row.description,
				url: row.url,
				source: row.source,
				publishedAt: row.publishedAt,
			})),
	);
	const scraper = new MockScraper(
		Object.fromEntries(
			caseDefinition.input
				.filter((row) => row.kind === "scraped_page")
				.map((row) => [row.url, row.content] as const),
		),
	);
	const configStore = new MockConfigStore({
		newsConfig: {
			[caseDefinition.config.channel]: {
				keywords: caseDefinition.config.newsKeywords,
				outputLanguage: caseDefinition.config.newsOutputLanguage,
			},
		},
	});

	await sendNewsSummary({
		slack,
		model: provider.smallModel,
		channel: caseDefinition.config.channel,
		newsProvider,
		scraper,
		timeZone: caseDefinition.config.timeZone,
		configStore,
		now: caseDefinition.config.newsNow,
	});

	const fetchedArticles = newsProvider.fetches[0]?.returnedArticles ?? [];

	return {
		kind: "sendNewsSummary",
		id: caseDefinition.id,
		outputs: {
			messages: slack.sentMessages,
			reactions: slack.reactions,
		},
		fetchedArticles,
		scrapedUrls: scraper.scrapedUrls,
	};
}
