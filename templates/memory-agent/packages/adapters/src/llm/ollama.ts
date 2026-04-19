import { createOllama } from "ollama-ai-provider-v2";
import type { LLMProvider } from "./types.js";

const ollama = createOllama({ baseURL: "http://localhost:11434/api" });

export const ollamaProvider: LLMProvider = {
	largeModel: ollama("gemma4:26b"),
	mediumModel: ollama("gemma4:26b"),
	smallModel: ollama("gemma4:26b"),
	embeddingModel: ollama.textEmbeddingModel("nomic-embed-text-v2-moe"),
};
