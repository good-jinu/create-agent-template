import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsArticle } from "@my-assistant/core";
import type { WorkflowEvalConfig, WorkflowEvalProvider } from "../config";
import { parseCsvObjects, readCsvFile } from "./csv";

type KeyValueRow = {
	key: string;
	value: string;
};

export interface HandleSlackMessageInputRow {
	kind: "slack_message";
	channel: string;
	threadTs: string;
	user: string;
	userName: string;
	text: string;
	ts: string;
}

export interface HandleSlackMessageEvalData {
	expectedKeywords: string[];
	expectThreadReply: boolean;
	expectReaction: boolean;
}

export interface HandleSlackMessageCaseData {
	config: WorkflowEvalConfig;
	inputMessages: HandleSlackMessageInputRow[];
	eval: HandleSlackMessageEvalData;
}

export interface SendNewsSummaryInputRow {
	kind: "news_article" | "scraped_page";
	title: string;
	description: string | null;
	url: string;
	source: string;
	publishedAt: string;
	content: string;
}

export interface SendNewsSummaryEvalData {
	expectedKeywords: string[];
	expectedHeaderPrefix: string;
	minBodyChars: number;
}

export interface SendNewsSummaryCaseData {
	config: WorkflowEvalConfig;
	newsArticles: NewsArticle[];
	scrapedPages: Record<string, string>;
	eval: SendNewsSummaryEvalData;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const caseDataRoot = path.resolve(here, "..", "..", "data", "cases");

function loadKeyValueRecord(
	caseName: string,
	fileName: string,
): Record<string, string> {
	const rows = loadCsv<KeyValueRow>(caseName, fileName);
	return Object.fromEntries(rows.map((row) => [row.key, row.value] as const));
}

function loadCsv<T extends object>(caseName: string, fileName: string): T[] {
	const filePath = path.join(caseDataRoot, caseName, fileName);
	if (!fs.existsSync(filePath)) {
		throw new Error(`Missing workflow eval fixture: ${filePath}`);
	}
	return parseCsvObjects<T>(readCsvFile(filePath));
}

function parseList(value: string | undefined): string[] {
	return (value ?? "")
		.split("|")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: string | undefined, fallback: Date): Date {
	if (!value) return fallback;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseProvider(
	value: string | undefined,
	fallback: WorkflowEvalProvider,
) {
	if (value === "openai" || value === "gemini" || value === "ollama") {
		return value;
	}
	return fallback;
}

function buildHandleSlackMessageConfig(): WorkflowEvalConfig {
	const env = loadKeyValueRecord("handleSlackMessage", "env.csv");
	const firstMessage = loadHandleSlackMessageInputRows()[0];

	return {
		scenario: "handleSlackMessage",
		provider: parseProvider(env.provider, "openai"),
		botName: env.botName || "My-Assistant-Eval",
		channel: env.channel || "C0123456789",
		timeZone: env.timeZone || "Asia/Seoul",
		messageText: env.messageText || firstMessage?.text || "",
		messageTs: env.messageTs || firstMessage?.ts || "",
		threadTs: env.threadTs?.trim() || undefined,
		userId: env.userId || "U0123456789",
		newsOutputLanguage: env.newsOutputLanguage?.trim() || undefined,
		newsKeywords: parseList(env.newsKeywords),
		newsNow: parseDate(env.newsNow, new Date("2026-04-23T09:00:00.000Z")),
	};
}

function buildSendNewsSummaryConfig(): WorkflowEvalConfig {
	const env = loadKeyValueRecord("sendNewsSummary", "env.csv");

	return {
		scenario: "sendNewsSummary",
		provider: parseProvider(env.provider, "openai"),
		botName: env.botName || "My-Assistant-Eval",
		channel: env.channel || "C0123456789",
		timeZone: env.timeZone || "Asia/Seoul",
		messageText: env.messageText || "",
		messageTs: env.messageTs || "",
		threadTs: env.threadTs?.trim() || undefined,
		userId: env.userId || "U0123456789",
		newsOutputLanguage: env.newsOutputLanguage?.trim() || undefined,
		newsKeywords: parseList(env.newsKeywords),
		newsNow: parseDate(env.newsNow, new Date("2026-04-23T09:00:00.000Z")),
	};
}

function loadHandleSlackMessageInputRows(): HandleSlackMessageInputRow[] {
	return loadCsv<HandleSlackMessageInputRow>(
		"handleSlackMessage",
		"input.csv",
	).filter((row) => row.kind === "slack_message");
}

function loadSendNewsSummaryInputRows(): SendNewsSummaryInputRow[] {
	return loadCsv<SendNewsSummaryInputRow>("sendNewsSummary", "input.csv");
}

function loadHandleSlackMessageEvalData(): HandleSlackMessageEvalData {
	const evalRecord = loadKeyValueRecord("handleSlackMessage", "eval.csv");
	return {
		expectedKeywords: parseList(evalRecord.expectedKeywords),
		expectThreadReply: evalRecord.expectThreadReply !== "false",
		expectReaction: evalRecord.expectReaction === "true",
	};
}

function loadSendNewsSummaryEvalData(): SendNewsSummaryEvalData {
	const evalRecord = loadKeyValueRecord("sendNewsSummary", "eval.csv");
	return {
		expectedKeywords: parseList(evalRecord.expectedKeywords),
		expectedHeaderPrefix:
			evalRecord.expectedHeaderPrefix || "*Hourly News Summary",
		minBodyChars: parseNumber(evalRecord.minBodyChars, 50),
	};
}

export const HANDLE_SLACK_MESSAGE_CASE_DATA: HandleSlackMessageCaseData = {
	config: buildHandleSlackMessageConfig(),
	inputMessages: loadHandleSlackMessageInputRows(),
	eval: loadHandleSlackMessageEvalData(),
};

export const SEND_NEWS_SUMMARY_CASE_DATA: SendNewsSummaryCaseData = {
	config: buildSendNewsSummaryConfig(),
	newsArticles: loadSendNewsSummaryInputRows()
		.filter((row) => row.kind === "news_article")
		.map((row) => ({
			title: row.title,
			description: row.description,
			url: row.url,
			source: row.source,
			publishedAt: row.publishedAt,
		})),
	scrapedPages: Object.fromEntries(
		loadSendNewsSummaryInputRows()
			.filter((row) => row.kind === "scraped_page")
			.map((row) => [row.url, row.content] as const),
	),
	eval: loadSendNewsSummaryEvalData(),
};
