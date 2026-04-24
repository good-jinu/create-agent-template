import { generateText, type LanguageModel, stepCountIs } from "ai";
import type { NewsArticle } from "../../types/news";
import { DAILY_PLANNER_PROMPT } from "./prompt";
import { createPlannerTools, HOURS } from "./tools";

export class DailyPlannerAgent {
	constructor(private readonly model: LanguageModel) {}

	async plan(articles: NewsArticle[]): Promise<Record<string, NewsArticle>> {
		if (articles.length < 17) {
			throw new Error(
				`Not enough articles to plan: need at least 17, got ${articles.length}`,
			);
		}

		const articleList = articles
			.map(
				(a, i) =>
					`[${i}] ${a.title}\nSource: ${a.source} | Published: ${a.publishedAt}\nURL: ${a.url}\nDesc: ${a.description ?? "N/A"}`,
			)
			.join("\n\n");

		let submittedSchedule: Record<string, number> | null = null;

		const tools = createPlannerTools({
			onUpdate: (schedule) => {
				submittedSchedule = schedule;
			},
		});

		await generateText({
			model: this.model,
			system: DAILY_PLANNER_PROMPT,
			prompt: `Available articles (${articles.length} total):\n\n${articleList}`,
			tools,
			toolChoice: { type: "tool", toolName: "submitSchedule" },
			stopWhen: stepCountIs(1),
		});

		if (!submittedSchedule) {
			throw new Error("[DailyPlannerAgent] Model did not call submitSchedule");
		}

		const schedules: Record<string, NewsArticle> = {};
		const usedIndices = new Set<number>();

		for (const hour of HOURS) {
			const idx = (submittedSchedule as Record<string, number>)[hour];
			const article = articles[idx];

			if (!article) {
				console.warn(
					`[DailyPlannerAgent] Invalid index ${idx} for hour ${hour}, skipping`,
				);
				continue;
			}

			if (usedIndices.has(idx)) {
				console.warn(
					`[DailyPlannerAgent] Duplicate index ${idx} for hour ${hour}, skipping`,
				);
				continue;
			}

			usedIndices.add(idx);
			schedules[hour] = article;
		}

		console.log(
			`[DailyPlannerAgent] Planned ${Object.keys(schedules).length} unique articles`,
		);
		return schedules;
	}
}
