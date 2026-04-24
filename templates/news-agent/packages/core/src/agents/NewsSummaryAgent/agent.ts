import { generateText, type LanguageModel } from "ai";
import type { NewsArticle } from "../../types/news";
import { NEWS_SUMMARY_PROMPT } from "./prompt";

export class NewsSummaryAgent {
	constructor(private readonly model: LanguageModel) {}

	async summarize(params: {
		date: string;
		articles: NewsArticle[];
	}): Promise<string> {
		if (params.articles.length === 0) {
			return "No articles found to summarize.";
		}

		const articleList = params.articles
			.map(
				(a, i) =>
					`${i + 1}. ${a.title}\n   Source: ${a.source} | ${a.publishedAt}\n   ${a.description ?? ""}\n   ${a.url}`,
			)
			.join("\n\n");

		const result = await generateText({
			model: this.model,
			system: NEWS_SUMMARY_PROMPT,
			prompt: `Today is ${params.date}. Here are the articles:\n\n${articleList}`,
		});

		return result.text;
	}
}
