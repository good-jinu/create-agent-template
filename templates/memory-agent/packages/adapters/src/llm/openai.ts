import { openai } from "@ai-sdk/openai";
import type { LLMProvider } from "./types.js";

export const openaiProvider: LLMProvider = {
	largeModel: openai("gpt-5.4"),
	mediumModel: openai("gpt-5.4-mini"),
	smallModel: openai("gpt-5.4-nano"),
	embeddingModel: openai.embeddingModel("text-embedding-3-small"),
	webSearchTool: { name: "web_search", instance: openai.tools.webSearch({}) },
};
