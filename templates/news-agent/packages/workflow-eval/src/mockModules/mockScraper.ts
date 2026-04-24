import type { IScraper } from "@my-assistant/core";

export class MockScraper implements IScraper {
	public readonly scrapedUrls: string[] = [];

	constructor(private readonly pages: Record<string, string>) {}

	async scrapeToMarkdown(url: string): Promise<string> {
		this.scrapedUrls.push(url);
		return (
			this.pages[url] ??
			`# Missing fixture\n\nNo mock content available for ${url}.`
		);
	}
}
