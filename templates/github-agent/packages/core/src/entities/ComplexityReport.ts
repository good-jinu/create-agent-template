/**
 * ComplexityReport Entity
 *
 * Represents the final analysis output produced by the AI agent
 * after autonomously exploring the codebase.
 */

export type ComplexityLevel = "High" | "Medium" | "Low";

export interface RiskFactor {
	/** Short description of the risk */
	description: string;
	/** Severity of this particular risk */
	severity: ComplexityLevel;
}

export interface ComplexityReport {
	/** Whether the feature is technically feasible in the current architecture */
	feasibility: "Possible" | "Difficult" | "Not Feasible";
	/** Brief explanation of the feasibility assessment */
	feasibilityReason: string;
	/** Overall modification complexity */
	complexity: ComplexityLevel;
	/** List of identified risk factors */
	riskFactors: RiskFactor[];
	/** List of files expected to require modification */
	targetFiles: { repo: string; path: string }[];
	/** Free-form summary of the analysis */
	summary: string;
}

/**
 * Factory function to create a default (empty) ComplexityReport.
 */
export function createEmptyReport(): ComplexityReport {
	return {
		feasibility: "Possible",
		feasibilityReason: "",
		complexity: "Low",
		riskFactors: [],
		targetFiles: [],
		summary: "",
	};
}
