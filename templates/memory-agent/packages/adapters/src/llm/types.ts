import type { EmbeddingModel, LanguageModel } from "ai";

export interface LLMProvider {
	largeModel: LanguageModel;
	mediumModel: LanguageModel;
	smallModel: LanguageModel;
	embeddingModel: EmbeddingModel<string>;
}
