import type { LanguageModel } from "ai";
import {
	buildRepositoryTools,
	type IRepositoryService,
} from "../agents/CodeInvestigator/tools.js";
import { MainAgent } from "../agents/MainAgent/agent.js";
import type { ComplexityReport } from "../entities/ComplexityReport.js";
import type {
	DeveloperProfile,
	OwnerLookupResult,
} from "../entities/DeveloperProfile.js";

export interface AnalysisResult {
	report: ComplexityReport;
	ownerLookup: OwnerLookupResult | null;
	rawAnalysis: string;
	filesExamined: string[];
}

export interface AnalyzeComplexityOptions {
	maxInvestigationSteps?: number;
}

export class AnalyzeComplexityWorkflow {
	private readonly mainAgent: MainAgent;

	constructor(
		private readonly model: LanguageModel,
		private readonly repoService: IRepositoryService,
	) {
		this.mainAgent = new MainAgent({ model: this.model });
	}

	async run(
		question: string,
		options: AnalyzeComplexityOptions = {},
	): Promise<AnalysisResult> {
		const tools = buildRepositoryTools(this.repoService);

		const result = await this.mainAgent.analyze(question, tools, {
			maxInvestigationSteps: options.maxInvestigationSteps ?? 5,
		});

		const ownerLookup =
			result.report.targetFiles.length > 0
				? await this.findOwners(result.report.targetFiles)
				: null;

		return {
			report: result.report,
			ownerLookup,
			rawAnalysis: result.rawAnalysis,
			filesExamined: result.filesExamined,
		};
	}

	private async findOwners(
		targetFiles: { repo: string; path: string }[],
	): Promise<OwnerLookupResult> {
		const contributorMap = new Map<string, DeveloperProfile>();

		for (const target of targetFiles) {
			try {
				const modifiers = await this.repoService.getLastModifier(
					target.repo,
					target.path,
					3,
				);
				for (const dev of modifiers) {
					const existing = contributorMap.get(dev.githubUsername);
					if (existing) {
						existing.commitCount += dev.commitCount;
						existing.recentFiles = [
							...new Set([...existing.recentFiles, ...dev.recentFiles]),
						];
						if (dev.lastCommitDate > existing.lastCommitDate) {
							existing.lastCommitDate = dev.lastCommitDate;
						}
					} else {
						contributorMap.set(dev.githubUsername, { ...dev });
					}
				}
			} catch (error) {
				console.warn(
					`Failed to get modifiers for ${target.repo} ${target.path}:`,
					error,
				);
			}
		}

		const sorted = Array.from(contributorMap.values()).sort((a, b) => {
			if (b.commitCount !== a.commitCount) return b.commitCount - a.commitCount;
			return b.lastCommitDate.localeCompare(a.lastCommitDate);
		});

		return {
			primaryOwner: sorted[0],
			otherContributors: sorted.slice(1),
		};
	}
}
