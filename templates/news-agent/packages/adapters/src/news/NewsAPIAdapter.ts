import type { INewsProvider, NewsArticle } from "@my-assistant/core";

interface NewsAPIArticle {
	title: string;
	description: string | null;
	url: string;
	source: { name: string };
	publishedAt: string;
}

interface NewsAPIResponse {
	status: string;
	articles: NewsAPIArticle[];
	message?: string;
}

export class NewsAPIAdapter implements INewsProvider {
	private static readonly BASE_URL = "https://newsapi.org/v2";

	constructor(private readonly apiKey: string) {}

	async fetchNewsList(options: {
		date?: string; // YYYY-MM-DD or ISO string
		from?: string; // ISO 8601 format
		keywords?: string[];
		sortBy?: "relevancy" | "popularity" | "publishedAt";
		pageSize?: number;
	}): Promise<NewsArticle[]> {
		const { date, from, keywords = [], sortBy, pageSize = 20 } = options;

		return this.fetchEverything({
			date,
			from,
			keywords,
			sortBy: sortBy ?? "publishedAt",
			pageSize,
		});
	}

	private async fetchEverything(options: {
		date?: string;
		from?: string;
		keywords: string[];
		sortBy: "relevancy" | "popularity" | "publishedAt";
		pageSize?: number;
	}): Promise<NewsArticle[]> {
		const { date, from, keywords, sortBy, pageSize = 20 } = options;

		// Fallback to everything without from filter (free plan restricts recent articles with from)
		const url = new URL(`${NewsAPIAdapter.BASE_URL}/everything`);
		url.searchParams.set(
			"q",
			keywords.length > 0 ? keywords.join(" OR ") : "technology",
		);

		const fromDate = from || date;
		if (fromDate) {
			url.searchParams.set("from", fromDate);
		}
		url.searchParams.set("sortBy", sortBy);
		url.searchParams.set("pageSize", String(pageSize));

		console.log(`[NewsAPI] Fetching everything: ${url.toString()}`);
		return this.executeFetch(url);
	}

	private async executeFetch(url: URL): Promise<NewsArticle[]> {
		const response = await fetch(url.toString(), {
			headers: { "X-Api-Key": this.apiKey },
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`[NewsAPI] Request failed: ${response.status} ${errorText}`,
			);
			throw new Error(
				`NewsAPI request failed: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as NewsAPIResponse;
		console.log(
			`[NewsAPI] Status: ${data.status}, Articles found: ${data.articles?.length ?? 0}`,
		);

		if (data.status !== "ok") {
			throw new Error(`NewsAPI error: ${data.message ?? "unknown error"}`);
		}

		return (data.articles ?? []).map((article) => ({
			title: article.title,
			description: article.description,
			url: article.url,
			source: article.source.name,
			publishedAt: article.publishedAt,
		}));
	}
}
