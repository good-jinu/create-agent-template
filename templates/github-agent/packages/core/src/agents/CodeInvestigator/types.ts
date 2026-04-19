import type { ZodTypeAny } from "zod/v4";

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ZodTypeAny;
	execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolCallEntry {
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
}

export interface InvestigationFindings {
	filesExamined: string[];
	keyFindings: string;
	toolCallLog: ToolCallEntry[];
	stepsUsed: number;
}
