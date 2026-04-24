import type { WorkflowEvalConfig, WorkflowEvalScenario } from "../config";
import type {
	HandleSlackMessageEvalData,
	HandleSlackMessageInputRow,
	SendNewsSummaryEvalData,
	SendNewsSummaryInputRow,
} from "../utils/caseData";
import {
	HANDLE_SLACK_MESSAGE_CASE_DATA,
	SEND_NEWS_SUMMARY_CASE_DATA,
} from "../utils/caseData";

interface WorkflowEvalCaseBase {
	id: string;
	description: string;
	scenario: WorkflowEvalScenario;
	config: WorkflowEvalConfig;
}

export interface HandleSlackMessageCaseDefinition extends WorkflowEvalCaseBase {
	scenario: "handleSlackMessage";
	input: HandleSlackMessageInputRow[];
	eval: HandleSlackMessageEvalData;
}

export interface SendNewsSummaryCaseDefinition extends WorkflowEvalCaseBase {
	scenario: "sendNewsSummary";
	input: SendNewsSummaryInputRow[];
	eval: SendNewsSummaryEvalData;
}

export type WorkflowEvalCaseDefinition =
	| HandleSlackMessageCaseDefinition
	| SendNewsSummaryCaseDefinition;

export const DEFAULT_WORKFLOW_EVAL_CASES: WorkflowEvalCaseDefinition[] = [
	{
		id: "handleSlackMessage-basic",
		description: "Summarize the rollout notes in a Slack thread reply.",
		scenario: "handleSlackMessage",
		config: HANDLE_SLACK_MESSAGE_CASE_DATA.config,
		input: HANDLE_SLACK_MESSAGE_CASE_DATA.inputMessages,
		eval: HANDLE_SLACK_MESSAGE_CASE_DATA.eval,
	},
	{
		id: "sendNewsSummary-basic",
		description: "Generate a news summary from the seeded article fixture.",
		scenario: "sendNewsSummary",
		config: SEND_NEWS_SUMMARY_CASE_DATA.config,
		input: [
			...SEND_NEWS_SUMMARY_CASE_DATA.newsArticles.map((article) => ({
				kind: "news_article" as const,
				title: article.title,
				description: article.description,
				url: article.url,
				source: article.source,
				publishedAt: article.publishedAt,
				content: "",
			})),
			...Object.entries(SEND_NEWS_SUMMARY_CASE_DATA.scrapedPages).map(
				([url, content]) => ({
					kind: "scraped_page" as const,
					title: "",
					description: "",
					url,
					source: "",
					publishedAt: "",
					content,
				}),
			),
		],
		eval: SEND_NEWS_SUMMARY_CASE_DATA.eval,
	},
];
