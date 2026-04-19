import type { LanguageModel } from "ai";
import type { ComplexityReport } from "../../entities/ComplexityReport.js";
import { CodeInvestigator } from "../CodeInvestigator/agent.js";
import type { ToolDefinition } from "../CodeInvestigator/types.js";
import { RequirementAnalyzer } from "../RequirementAnalyzer/agent.js";

export interface MainAgentResult {
	report: ComplexityReport;
	filesExamined: string[];
	rawAnalysis: string;
	investigationStepsUsed: number;
}

export class MainAgent {
	private readonly investigator: CodeInvestigator;
	private readonly analyzer: RequirementAnalyzer;

	constructor(opts: { model: LanguageModel }) {
		this.investigator = new CodeInvestigator(opts.model);
		this.analyzer = new RequirementAnalyzer(opts.model);
	}

	async analyze(
		question: string,
		toolDefs: ToolDefinition[],
		options: { maxInvestigationSteps?: number } = {},
	): Promise<MainAgentResult> {
		const maxSteps = options.maxInvestigationSteps ?? 5;

		// Phase 1: Investigate the codebase
		const findings = await this.investigator.investigate(
			question,
			toolDefs,
			maxSteps,
		);

		// Phase 2: Analyze complexity from findings
		const analysis = await this.analyzer.analyze(question, findings);

		return {
			report: analysis.report,
			filesExamined: findings.filesExamined,
			rawAnalysis: analysis.rawText,
			investigationStepsUsed: findings.stepsUsed,
		};
	}
}
