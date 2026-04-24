import {
	geminiProvider,
	type LLMProvider,
	ollamaProvider,
	openaiProvider,
} from "@my-assistant/adapters";

export function resolveProvider(name: string): LLMProvider {
	switch (name) {
		case "openai":
			return openaiProvider;
		case "gemini":
			return geminiProvider;
		default:
			return ollamaProvider;
	}
}
