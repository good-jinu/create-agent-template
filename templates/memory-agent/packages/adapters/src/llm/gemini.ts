import { google } from "@ai-sdk/google";
import type { LLMProvider } from "./types.js";

export const geminiProvider: LLMProvider = {
	largeModel: google("gemini-3.1-pro"),
	mediumModel: google("gemini-3.0-flash"),
	smallModel: google("gemini-3.1-flash-lite"),
	embeddingModel: google.textEmbeddingModel("text-embedding-004"),
};
