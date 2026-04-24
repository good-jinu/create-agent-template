import type { IScraper } from "@my-assistant/core";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const DEFAULT_REMOVED_SELECTORS = "script, style, nav, footer, header";

export class ScraperAdapter implements IScraper {
	private readonly turndownService = new TurndownService();

	async scrapeToMarkdown(url: string): Promise<string> {
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(
				`Failed to scrape ${url}: ${response.status} ${response.statusText}`,
			);
		}

		const html = await response.text();
		const $ = cheerio.load(html);
		$(DEFAULT_REMOVED_SELECTORS).remove();

		const content = $("body").html() ?? "";
		return this.turndownService.turndown(content).trim();
	}
}
