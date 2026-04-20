import type { EmbeddingModel, LanguageModel, Tool } from "ai";

export interface LLMProvider {
	largeModel: LanguageModel;
	mediumModel: LanguageModel;
	smallModel: LanguageModel;
	embeddingModel: EmbeddingModel;
	webSearchTool?: { name: string; instance: Tool };
}
