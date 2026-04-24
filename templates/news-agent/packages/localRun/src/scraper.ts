import { ScraperAdapter } from "@my-assistant/adapters";

const url = process.argv[2];

if (!url) {
	console.log("Please provide a URL: node dist/scraper.mjs <url>");
	process.exit(1);
}

const scraper = new ScraperAdapter();

try {
	const markdown = await scraper.scrapeToMarkdown(url);
	console.log(markdown);
} catch (error) {
	if (error instanceof Error) {
		console.error("Error:", error.message);
	} else {
		console.error("Error:", error);
	}
	process.exit(1);
}
