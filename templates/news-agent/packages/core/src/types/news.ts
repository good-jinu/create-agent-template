export interface NewsArticle {
	title: string;
	description: string | null;
	url: string;
	source: string;
	publishedAt: string;
}

export interface INewsProvider {
	fetchNewsList(options: {
		date?: string;
		from?: string;
		keywords?: string[];
		sortBy?: "relevancy" | "popularity" | "publishedAt";
		pageSize?: number;
	}): Promise<NewsArticle[]>;
}
