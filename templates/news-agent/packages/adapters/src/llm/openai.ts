import { openai } from "@ai-sdk/openai";
import type { LLMProvider } from "./types";

export const openaiProvider: LLMProvider = {
	largeModel: openai("gpt-5.4-mini"),
	mediumModel: openai("gpt-5.4-nano"),
	smallModel: openai("gpt-5.4-nano"),
	embeddingModel: openai.embeddingModel("text-embedding-3-small"),
	webSearchTool: { name: "web_search", instance: openai.tools.webSearch({}) },
};
