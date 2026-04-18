import {
	type LanguageModel,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
	tool,
} from "ai";
import type {
	InvestigationFindings,
	ToolCallEntry,
	ToolDefinition,
} from "./types.js";

const INVESTIGATOR_PROMPT = `You are Code-Insight's Code Investigator — a senior engineer that explores a codebase to understand architecture and implementation.

Your job is to:
1. Understand the user's question about a feature or code change
2. Use search tools to locate relevant files
3. Read the actual code to understand dependencies, patterns, and architecture
4. Synthesize what you found into clear findings

INVESTIGATION STRATEGY:
- Start with broad searches to understand the area
- Drill into specific files once you know what to look for
- Read the actual code — don't guess from file names
- Identify related files, dependencies, and potential impact areas
- Note any existing patterns or conventions the codebase follows

Be thorough but efficient. Focus on understanding the code, not just listing files.`;

export class CodeInvestigator {
	constructor(private readonly model: LanguageModel) {}

	async investigate(
		question: string,
		toolDefs: ToolDefinition[],
		maxSteps = 5,
	): Promise<InvestigationFindings> {
		const toolCallLog: ToolCallEntry[] = [];

		const aiTools: ToolSet = {};
		for (const def of toolDefs) {
			aiTools[def.name] = tool({
				description: def.description,
				inputSchema: def.parameters,
				execute: async (args) => {
					const rawArgs = args as Record<string, unknown>;
					console.log(
						`[Investigator Tool] ${def.name}(${JSON.stringify(rawArgs)})`,
					);
					const result = await def.execute(rawArgs);
					toolCallLog.push({ toolName: def.name, args: rawArgs, result });
					return result;
				},
			});
		}

		const agent = new ToolLoopAgent({
			model: this.model,
			instructions: INVESTIGATOR_PROMPT,
			tools: aiTools,
			stopWhen: stepCountIs(maxSteps),
		});

		const result = await agent.generate({ prompt: question });

		const filesExamined = toolCallLog
			.filter((e) => e.toolName === "getFileContent")
			.map((e) => e.args.path as string);

		return {
			filesExamined: [...new Set(filesExamined)],
			keyFindings: result.text,
			toolCallLog,
			stepsUsed: result.steps?.length ?? 0,
		};
	}
}
