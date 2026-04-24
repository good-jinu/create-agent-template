import { generateText, type LanguageModel } from "ai";
import { SUMMARY_PROMPT } from "./prompt";

export class SummaryAgent {
	constructor(private readonly model: LanguageModel) {}

	async summarize(params: {
		title?: string;
		source?: string;
		url?: string;
		content: string;
	}): Promise<string> {
		const content = params.content.trim();

		if (!content) {
			return "No content found to summarize.";
		}

		const context = [
			params.title ? `Title: ${params.title}` : null,
			params.source ? `Source: ${params.source}` : null,
			params.url ? `URL: ${params.url}` : null,
			`Content:\n${content}`,
		]
			.filter((value): value is string => value !== null)
			.join("\n\n");

		const result = await generateText({
			model: this.model,
			system: SUMMARY_PROMPT,
			prompt: context,
		});

		return result.text;
	}
}
