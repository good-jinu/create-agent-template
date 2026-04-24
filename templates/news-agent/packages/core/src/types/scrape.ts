export interface IScraper {
	scrapeToMarkdown(url: string): Promise<string>;
}
