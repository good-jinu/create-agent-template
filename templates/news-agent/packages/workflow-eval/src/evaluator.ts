import type {
	HandleSlackMessageCaseDefinition,
	SendNewsSummaryCaseDefinition,
	WorkflowEvalCaseDefinition,
} from "./cases/definitions";
import {
	type HandleSlackMessageCaseArtifact,
	runHandleSlackMessageCase,
} from "./cases/handleSlackMessageCase";
import {
	runSendNewsSummaryCase,
	type SendNewsSummaryCaseArtifact,
} from "./cases/sendNewsSummaryCase";
import type { WorkflowEvalConfig } from "./config";
import type {
	MockChatMessageRecord,
	MockReactionRecord,
} from "./mockModules/mockChatPlatform";

export interface WorkflowEvalCaseScore {
	name: string;
	score: number;
	maxScore: number;
	notes: string[];
}

export interface WorkflowEvalCaseReport {
	id: string;
	description: string;
	scenario: WorkflowEvalConfig["scenario"];
	passed: boolean;
	score: number;
	maxScore: number;
	scores: WorkflowEvalCaseScore[];
	notes: string[];
	outputs: {
		messages: MockChatMessageRecord[];
		reactions: MockReactionRecord[];
	};
}

export interface WorkflowEvalSuiteReport {
	totalScore: number;
	maxScore: number;
	averageScore: number;
	passedCases: number;
	totalCases: number;
	cases: WorkflowEvalCaseReport[];
}

type WorkflowArtifact =
	| HandleSlackMessageCaseArtifact
	| SendNewsSummaryCaseArtifact;

export async function runWorkflowEvalSuite(
	baseConfig: WorkflowEvalConfig,
	cases: WorkflowEvalCaseDefinition[],
): Promise<WorkflowEvalSuiteReport> {
	const reports: WorkflowEvalCaseReport[] = [];

	for (const caseDefinition of cases) {
		const mergedConfig = { ...baseConfig, ...caseDefinition.config };
		const mergedCaseDefinition = {
			...caseDefinition,
			config: mergedConfig,
		} as WorkflowEvalCaseDefinition;

		const artifact = await runWorkflowCase(mergedCaseDefinition);
		reports.push(scoreWorkflowCase(caseDefinition, artifact));
	}

	const totalScore = reports.reduce((sum, item) => sum + item.score, 0);
	const maxScore = reports.reduce((sum, item) => sum + item.maxScore, 0);
	const passedCases = reports.filter((item) => item.passed).length;

	return {
		totalScore,
		maxScore,
		averageScore: maxScore > 0 ? totalScore / maxScore : 0,
		passedCases,
		totalCases: reports.length,
		cases: reports,
	};
}

async function runWorkflowCase(
	caseDefinition: WorkflowEvalCaseDefinition,
): Promise<WorkflowArtifact> {
	if (caseDefinition.scenario === "sendNewsSummary") {
		return runSendNewsSummaryCase(
			caseDefinition as SendNewsSummaryCaseDefinition,
		);
	}

	return runHandleSlackMessageCase(
		caseDefinition as HandleSlackMessageCaseDefinition,
	);
}

function scoreWorkflowCase(
	caseDefinition: WorkflowEvalCaseDefinition,
	artifact: WorkflowArtifact,
): WorkflowEvalCaseReport {
	if (artifact.kind === "handleSlackMessage") {
		return scoreHandleSlackMessageCase(
			caseDefinition as HandleSlackMessageCaseDefinition,
			artifact,
		);
	}
	return scoreSendNewsSummaryCase(
		caseDefinition as SendNewsSummaryCaseDefinition,
		artifact,
	);
}

function scoreHandleSlackMessageCase(
	caseDefinition: HandleSlackMessageCaseDefinition,
	artifact: HandleSlackMessageCaseArtifact,
): WorkflowEvalCaseReport {
	const responseText = artifact.outputs.messages
		.filter((message) => message.type === "thread")
		.map((message) => message.text)
		.join("\n");
	const allText = [artifact.inputText, responseText].join("\n").toLowerCase();
	const keywordHits = caseDefinition.eval.expectedKeywords.filter((keyword) =>
		allText.includes(keyword.toLowerCase()),
	).length;
	const threadReplyPresent = artifact.outputs.messages.some(
		(message) => message.type === "thread",
	);
	const reactionPresent = artifact.outputs.reactions.length > 0;

	const scores: WorkflowEvalCaseScore[] = [
		{
			name: "response",
			score: artifact.outputs.messages.length > 0 ? 4 : 0,
			maxScore: 4,
			notes:
				artifact.outputs.messages.length > 0
					? ["Workflow produced a reply."]
					: ["No Slack reply was generated."],
		},
		{
			name: "threading",
			score: caseDefinition.eval.expectThreadReply
				? threadReplyPresent
					? 3
					: 0
				: threadReplyPresent
					? 0
					: 3,
			maxScore: 3,
			notes: threadReplyPresent
				? ["Reply stayed in thread."]
				: ["Reply did not stay in thread."],
		},
		{
			name: "keyword_overlap",
			score: Math.min(keywordHits * 2, 3),
			maxScore: 3,
			notes:
				keywordHits > 0
					? [`Matched ${keywordHits} expected keywords.`]
					: ["No expected topic keywords found in the output."],
		},
		{
			name: "reaction_discipline",
			score: caseDefinition.eval.expectReaction
				? reactionPresent
					? 1
					: 0
				: reactionPresent
					? 0
					: 1,
			maxScore: 1,
			notes: reactionPresent
				? ["Reaction was added."]
				: ["No reaction was added."],
		},
	];

	return buildCaseReport(
		caseDefinition,
		artifact.outputs.messages,
		artifact.outputs.reactions,
		scores,
	);
}

function scoreSendNewsSummaryCase(
	caseDefinition: SendNewsSummaryCaseDefinition,
	artifact: SendNewsSummaryCaseArtifact,
): WorkflowEvalCaseReport {
	const responseText = artifact.outputs.messages
		.filter((message) => message.type === "message")
		.map((message) => message.text)
		.join("\n");
	const allText = responseText.toLowerCase();
	const keywordHits = caseDefinition.eval.expectedKeywords.filter((keyword) =>
		allText.includes(keyword.toLowerCase()),
	).length;
	const headerPresent = responseText.startsWith(
		caseDefinition.eval.expectedHeaderPrefix,
	);
	const hasSummaryBody =
		responseText.trim().length >= caseDefinition.eval.minBodyChars;

	const scores: WorkflowEvalCaseScore[] = [
		{
			name: "message_sent",
			score: artifact.outputs.messages.length > 0 ? 4 : 0,
			maxScore: 4,
			notes:
				artifact.outputs.messages.length > 0
					? ["News summary was sent."]
					: ["No Slack message was sent."],
		},
		{
			name: "header_format",
			score: headerPresent ? 2 : 0,
			maxScore: 2,
			notes: headerPresent
				? ["Hourly summary header was present."]
				: ["Hourly summary header was missing."],
		},
		{
			name: "content_overlap",
			score: Math.min(keywordHits, 3),
			maxScore: 3,
			notes:
				keywordHits > 0
					? [`Matched ${keywordHits} expected keywords.`]
					: ["No expected topic keywords found in the summary."],
		},
		{
			name: "summary_shape",
			score: hasSummaryBody ? 1 : 0,
			maxScore: 1,
			notes: hasSummaryBody
				? ["Summary had non-trivial content."]
				: ["Summary was too short or empty."],
		},
	];

	return buildCaseReport(
		caseDefinition,
		artifact.outputs.messages,
		artifact.outputs.reactions,
		scores,
	);
}

function buildCaseReport(
	caseDefinition: WorkflowEvalCaseDefinition,
	messages: MockChatMessageRecord[],
	reactions: MockReactionRecord[],
	scores: WorkflowEvalCaseScore[],
): WorkflowEvalCaseReport {
	const score = scores.reduce((sum, item) => sum + item.score, 0);
	const maxScore = scores.reduce((sum, item) => sum + item.maxScore, 0);
	return {
		id: caseDefinition.id,
		description: caseDefinition.description,
		scenario: caseDefinition.scenario,
		passed: score === maxScore,
		score,
		maxScore,
		scores,
		notes: scores.flatMap((item) => item.notes),
		outputs: { messages, reactions },
	};
}
