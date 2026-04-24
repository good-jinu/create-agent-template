import type { LanguageModel } from "ai";
import { DailyPlannerAgent } from "../agents/DailyPlannerAgent/agent";
import type { IConfigStore } from "../config/types";
import type { INewsProvider } from "../types/news";

export interface DailyPlannerParams {
	model: LanguageModel;
	channel: string;
	newsProvider: INewsProvider;
	configStore: IConfigStore;
	now?: Date;
}

export async function dailyPlanner({
	model,
	channel,
	newsProvider,
	configStore,
	now = new Date(),
}: DailyPlannerParams): Promise<void> {
	console.log(
		`[dailyPlanner] Starting daily plan channel=${channel} at=${now.toISOString()}`,
	);

	const newsConfig = await configStore.getNewsConfig(channel);
	const keywords =
		newsConfig?.keywords && newsConfig.keywords.length > 0
			? newsConfig.keywords
			: ["AI", "Tech", "Business"];

	const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
	const fromISO = `${twoDaysAgo.toISOString().split(".")[0]}Z`;

	console.log(
		`[dailyPlanner] Fetching broad pool keywords=${keywords.join(",")} from=${fromISO}`,
	);
	const articles = await newsProvider.fetchNewsList({
		from: fromISO,
		keywords,
		sortBy: newsConfig?.sortBy ?? "publishedAt",
		pageSize: 100,
	});
	console.log(`[dailyPlanner] Pool fetched count=${articles.length}`);

	if (articles.length < 17) {
		console.error(
			`[dailyPlanner] Insufficient articles: ${articles.length} < 17. Aborting.`,
		);
		return;
	}

	const agent = new DailyPlannerAgent(model);
	const schedules = await agent.plan(articles);

	await configStore.setHourlySchedules(channel, schedules);
	console.log(
		`[dailyPlanner] Saved ${Object.keys(schedules).length} scheduled articles for channel=${channel}`,
	);
}
