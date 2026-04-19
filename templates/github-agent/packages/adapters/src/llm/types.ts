import type { LanguageModel } from "ai";

export interface LLMProvider {
	largeModel: LanguageModel;
	mediumModel: LanguageModel;
	smallModel: LanguageModel;
}
