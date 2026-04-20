import "dotenv/config";
import { ollamaProvider, SlackAdapter } from "@my-ai-agent/adapters";
import { LanceDbAgentMemory } from "@my-ai-agent/adapters/lancedb";
import { handleSlackMessage } from "@my-ai-agent/core";
import pkg from "@slack/bolt";
import { embed } from "ai";

const { App } = pkg;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID ?? "";

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
	console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN");
	process.exit(1);
}

const slackApp = new App({
	token: SLACK_BOT_TOKEN,
	appToken: SLACK_APP_TOKEN,
	socketMode: true,
});

const embedFn = (text: string) =>
	embed({ model: ollamaProvider.embeddingModel, value: text }).then(
		(r) => r.embedding,
	);

const memory = new LanceDbAgentMemory("./lancedb-data", embedFn);

slackApp.message(async ({ message }) => {
	if (message.subtype !== undefined) return;
	if (SLACK_CHANNEL_ID && message.channel !== SLACK_CHANNEL_ID) return;

	console.log(`[Message]: ${message.text}`);

	const slackAdapter = new SlackAdapter(slackApp, SLACK_BOT_TOKEN);

	try {
		await handleSlackMessage({
			slack: slackAdapter,
			model: ollamaProvider.smallModel,
			channel: message.channel,
			messageTs: message.ts,
			threadTs: message.thread_ts,
			botName: "My-Assistant-Local",
			memory,
		});
	} catch (error) {
		console.error("Agent loop failed:", error);
	}
});

(async () => {
	await slackApp.start();
	console.log("⚡ My Assistant (Local) is running via Socket Mode");
})();
