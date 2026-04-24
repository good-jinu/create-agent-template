import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { SummaryAgent } from "../agents/SummaryAgent/agent";
import type { IConfigStore, NewsConfig } from "../config/types";
import type { IChatPlatform } from "../types/chatPlatform";
import type { INewsProvider, NewsArticle } from "../types/news";
import type { IScraper } from "../types/scrape";

export interface SendNewsSummaryParams {
	slack: IChatPlatform;
	model: LanguageModel;
	channel: string;
	newsProvider: INewsProvider;
	scraper: IScraper;
	timeZone?: string;
	configStore?: IConfigStore;
	now?: Date;
}

async function translateText(
	model: LanguageModel,
	text: string,
	outputLanguage: string,
): Promise<string> {
	const result = await generateText({
		model,
		system:
			"You are a professional translator. Preserve meaning and markdown formatting. Output only the translated text.",
		prompt: `Translate the following text into ${outputLanguage}:\n\n${text}`,
	});
	return result.text;
}

export async function sendNewsSummary({
	slack,
	model,
	channel,
	newsProvider,
	scraper,
	timeZone = "Asia/Seoul",
	configStore,
	now = new Date(),
}: SendNewsSummaryParams): Promise<void> {
	const displayDate = now.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone,
	});

	const localHour = Number(
		new Intl.DateTimeFormat("en-US", {
			hour: "2-digit",
			hourCycle: "h23",
			timeZone,
		}).format(now),
	);

	const newsConfig =
		configStore && channel ? await configStore.getNewsConfig(channel) : null;

	// Prefer pre-selected article from daily planner; fall back to keyword search
	let newsArticle: NewsArticle | undefined =
		resolvePreSelectedArticle(newsConfig, localHour) ?? undefined;

	if (newsArticle) {
		console.log(
			`[sendNewsSummary] Using pre-selected article hour=${localHour} url=${newsArticle.url}`,
		);
	} else {
		const oneDayAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
		const fromISO = `${oneDayAgo.toISOString().split(".")[0]}Z`;
		const keywords =
			newsConfig?.keywords && newsConfig.keywords.length > 0
				? newsConfig.keywords
				: ["AI", "Google"];
		const sortBy = newsConfig?.sortBy;

		console.log(
			`[sendNewsSummary] No pre-selected article, falling back to keyword search hour=${localHour} from=${fromISO}`,
		);
		const articles = await newsProvider.fetchNewsList({
			from: fromISO,
			keywords,
			sortBy,
			pageSize: 5,
		});
		console.log(
			`[sendNewsSummary] Fallback headlines fetched count=${articles.length} firstTitle=${articles[0]?.title ?? "none"}`,
		);
		newsArticle = articles[0];
	}

	if (!newsArticle) {
		console.log("[sendNewsSummary] No article available");
		await slack.sendMessage(
			channel,
			`*Hourly News Summary — ${displayDate}*\n\nNo articles found to summarize.`,
		);
		return;
	}

	console.log(`[sendNewsSummary] Scraping article url=${newsArticle.url}`);
	const scrapedContent = await scraper.scrapeToMarkdown(newsArticle.url);
	console.log(
		`[sendNewsSummary] Scrape complete chars=${scrapedContent.length}`,
	);

	const agent = new SummaryAgent(model);
	console.log("[sendNewsSummary] Sending scraped content to SummaryAgent");
	const summary = await agent.summarize({
		title: newsArticle.title,
		source: newsArticle.source,
		url: newsArticle.url,
		content: scrapedContent,
	});
	console.log(`[sendNewsSummary] Summary complete chars=${summary.length}`);

	const finalMessage = newsConfig?.outputLanguage?.trim()
		? await translateText(model, summary, newsConfig.outputLanguage.trim())
		: summary;

	const articleLink = `[${newsArticle.title}](${newsArticle.url})`;
	await slack.sendMessage(channel, `${articleLink}\n\n${finalMessage}`);
}

function resolvePreSelectedArticle(
	newsConfig: NewsConfig | null,
	hour: number,
): NewsArticle | null {
	if (!newsConfig?.hourlySchedules) return null;
	const hourKey = String(hour);
	return (
		newsConfig.hourlySchedules[hourKey] ??
		newsConfig.hourlySchedules[hourKey.padStart(2, "0")] ??
		null
	);
}
