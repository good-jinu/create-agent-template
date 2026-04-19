import { generateText, type LanguageModel } from "ai";
import type { ComplexityReport } from "../../entities/ComplexityReport.js";
import { createEmptyReport } from "../../entities/ComplexityReport.js";
import type { InvestigationFindings } from "../CodeInvestigator/types.js";

export interface AnalysisResult {
	report: ComplexityReport;
	rawText: string;
}

const ANALYZER_PROMPT = `You are Code-Insight's Requirement Analyzer — a senior tech lead that evaluates feature implementation complexity.

You will receive:
1. The user's original question about a feature or code change
2. Investigation findings from a Code Investigator that explored the actual codebase

Your job is to synthesize the findings into a structured complexity report.

IMPORTANT GUIDELINES:
- Base your analysis on actual code evidence, not assumptions
- Be specific about what files need changes and why
- Identify concrete risks (e.g., "requires DB migration", "breaking API change")
- Do NOT provide time estimates in days/hours. Use qualitative complexity levels.
- If the findings are insufficient to make a judgment, note it but still provide best-effort analysis.

Your final response MUST be a JSON block in this format:
\`\`\`json
{
  "feasibility": "Possible" | "Difficult" | "Not Feasible",
  "feasibilityReason": "Brief explanation",
  "complexity": "High" | "Medium" | "Low",
  "riskFactors": [
    { "description": "Risk description", "severity": "High" | "Medium" | "Low" }
  ],
  "targetFiles": [
    { "repo": "org/repo-name", "path": "src/path/to/file.ts" }
  ],
  "summary": "Comprehensive analysis summary"
}
\`\`\``;

export class RequirementAnalyzer {
	constructor(private readonly model: LanguageModel) {}

	async analyze(
		question: string,
		findings: InvestigationFindings,
	): Promise<AnalysisResult> {
		const prompt = `## User's Question

${question}

## Investigation Findings

${findings.keyFindings}

## Files Examined

${findings.filesExamined.join("\n")}

---

Based on the investigation findings above, produce a complexity analysis report in the required JSON format.`;

		const result = await generateText({
			model: this.model,
			prompt,
			system: ANALYZER_PROMPT,
		});

		const report = parseReportFromText(result.text);

		return { report, rawText: result.text };
	}
}

function parseReportFromText(text: string): ComplexityReport {
	const jsonReport = tryParseJSON(text);
	if (jsonReport) {
		return normalizeReport(jsonReport);
	}
	return parseHeuristic(text);
}

function tryParseJSON(text: string): Partial<ComplexityReport> | null {
	const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
	if (jsonBlockMatch) {
		try {
			return JSON.parse(jsonBlockMatch[1].trim());
		} catch {
			// not valid JSON
		}
	}

	const jsonMatch = text.match(/\{[\s\S]*"feasibility"[\s\S]*\}/);
	if (jsonMatch) {
		try {
			return JSON.parse(jsonMatch[0]);
		} catch {
			// not valid JSON
		}
	}

	return null;
}

function normalizeReport(partial: Partial<ComplexityReport>): ComplexityReport {
	const base = createEmptyReport();
	return {
		...base,
		...partial,
		feasibility: partial.feasibility ?? base.feasibility,
		complexity: normalizeComplexityLevel(partial.complexity) ?? base.complexity,
		riskFactors: partial.riskFactors ?? base.riskFactors,
		targetFiles: partial.targetFiles ?? base.targetFiles,
	};
}

function parseHeuristic(text: string): ComplexityReport {
	const report = createEmptyReport();
	const lowerText = text.toLowerCase();

	if (lowerText.includes("not feasible") || lowerText.includes("impossible")) {
		report.feasibility = "Not Feasible";
	} else if (
		lowerText.includes("difficult") ||
		lowerText.includes("challenging")
	) {
		report.feasibility = "Difficult";
	} else {
		report.feasibility = "Possible";
	}

	if (lowerText.includes("complexity: high")) {
		report.complexity = "High";
	} else if (lowerText.includes("complexity: medium")) {
		report.complexity = "Medium";
	} else if (lowerText.includes("complexity: low")) {
		report.complexity = "Low";
	}

	const fileMatches = text.match(
		/(?:^|\s|`)((?:src|lib|app|pages|components|api|utils)\/[\w/.%-]+\.[\w]+)/gm,
	);
	if (fileMatches) {
		const paths = [
			...new Set(fileMatches.map((m) => m.trim().replace(/`/g, ""))),
		];
		// Fallback for heuristics: we assume a placeholder repo name since it's hard to guess
		report.targetFiles = paths.map((p) => ({ repo: "unknown/repo", path: p }));
	}

	report.summary = text;
	return report;
}

function normalizeComplexityLevel(
	level: string | undefined,
): "High" | "Medium" | "Low" | null {
	if (!level) return null;
	const normalized = level.trim().toLowerCase();
	if (normalized === "high") return "High";
	if (normalized === "medium") return "Medium";
	if (normalized === "low") return "Low";
	return null;
}
