import { geminiProvider, SlackAdapter } from "@my-ai-agent/adapters";
import { FirestoreAgentMemory } from "@my-ai-agent/adapters/firestore";
import { handleSlackMessage } from "@my-ai-agent/core";
import { App, ExpressReceiver } from "@slack/bolt";
import { embed } from "ai";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

initializeApp();

// ─── Firebase Secrets ─────────────────────────────────────────────
const slackBotToken = defineSecret("SLACK_BOT_TOKEN");
const slackSigningSecret = defineSecret("SLACK_SIGNING_SECRET");
const geminiApiKey = defineSecret("GOOGLE_GENERATIVE_AI_API_KEY");

// ─── Configuration ────────────────────────────────────────────────
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID ?? "";

// ─── Slack + Express Receiver Setup ───────────────────────────────
const receiver = new ExpressReceiver({
	signingSecret: process.env.SLACK_SIGNING_SECRET || "placeholder",
	endpoints: "/events",
	processBeforeResponse: true,
});

const slackApp = new App({
	token: process.env.SLACK_BOT_TOKEN,
	receiver,
});

// ─── Memory Setup ─────────────────────────────────────────────────
const db = getFirestore();
const embedFn = (text: string) =>
	embed({ model: geminiProvider.embeddingModel, value: text }).then(
		(r) => r.embedding,
	);
const memory = new FirestoreAgentMemory(db, embedFn);

// ─── Event Handler: message in watched channel ────────────────────
slackApp.message(async ({ message }) => {
	if (message.subtype !== undefined) return;
	if (SLACK_CHANNEL_ID && message.channel !== SLACK_CHANNEL_ID) return;

	const slackAdapter = new SlackAdapter(slackApp, slackBotToken.value());

	try {
		await handleSlackMessage({
			slack: slackAdapter,
			model: geminiProvider.smallModel,
			channel: message.channel,
			messageTs: message.ts,
			threadTs: message.thread_ts,
			botName: "My-Assistant",
			teamContext:
				"You are a personal AI assistant. You help answer questions, provide information, and assist with tasks in this Slack channel. You should be helpful, concise, and only respond when appropriate.",
			memory,
		});
	} catch (error) {
		console.error("Agent loop failed:", error);
	}
});

// ─── Export as Firebase HTTP Function ─────────────────────────────
export const slackbot = onRequest(
	{
		secrets: [slackBotToken, slackSigningSecret, geminiApiKey],
		timeoutSeconds: 60,
		memory: "256MiB",
	},
	receiver.app,
);
