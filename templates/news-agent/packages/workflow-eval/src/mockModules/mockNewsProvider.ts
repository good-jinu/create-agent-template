import type { INewsProvider, NewsArticle } from "@my-assistant/core";

export class MockNewsProvider implements INewsProvider {
	public readonly fetches: Array<{
		options: {
			date?: string;
			from?: string;
			keywords?: string[];
			sortBy?: "relevancy" | "popularity" | "publishedAt";
			pageSize?: number;
		};
		returnedArticles: NewsArticle[];
	}> = [];

	constructor(private readonly articles: NewsArticle[]) {}

	async fetchNewsList(options: {
		date?: string;
		from?: string;
		keywords?: string[];
		sortBy?: "relevancy" | "popularity" | "publishedAt";
		pageSize?: number;
	}): Promise<NewsArticle[]> {
		const keywords = (options.keywords ?? []).map((keyword) =>
			keyword.toLowerCase(),
		);

		const filtered =
			keywords.length > 0
				? this.articles.filter((article) => {
						const haystack =
							`${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
						return keywords.some((keyword) => haystack.includes(keyword));
					})
				: this.articles;

		const returnedArticles = filtered.slice(0, options.pageSize ?? 5);
		this.fetches.push({ options, returnedArticles });
		return returnedArticles;
	}
}
