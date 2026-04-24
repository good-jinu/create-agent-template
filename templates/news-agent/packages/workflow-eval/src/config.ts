export type WorkflowEvalScenario = "handleSlackMessage" | "sendNewsSummary";
export type WorkflowEvalProvider = "ollama" | "openai" | "gemini";

export interface WorkflowEvalConfig {
	scenario: WorkflowEvalScenario;
	provider: WorkflowEvalProvider;
	botName: string;
	channel: string;
	timeZone: string;
	messageText: string;
	messageTs: string;
	threadTs?: string;
	userId: string;
	newsOutputLanguage?: string;
	newsKeywords: string[];
	newsNow: Date;
}

export const DEFAULT_WORKFLOW_EVAL_CONFIG: WorkflowEvalConfig = {
	scenario: "handleSlackMessage",
	provider: "openai",
	botName: "My-Assistant-Eval",
	channel: "C0123456789",
	timeZone: "Asia/Seoul",
	messageText: "Can you summarize the latest update?",
	messageTs: "1713820000.000100",
	threadTs: undefined,
	userId: "U0123456789",
	newsOutputLanguage: undefined,
	newsKeywords: ["AI", "Google"],
	newsNow: new Date("2026-04-23T09:00:00.000Z"),
};
