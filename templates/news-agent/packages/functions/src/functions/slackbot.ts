import {
	createFirestoreMemory,
	createSlackExpressApp,
	FirestoreConfigStore,
	openaiProvider,
} from "@my-assistant/adapters";
import { handleSlackMessage } from "@my-assistant/core";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import "../shared/init";
import {
	openaiApiKey,
	slackBotToken,
	slackSigningSecret,
} from "../shared/secrets";

let slackApp: ReturnType<typeof createSlackExpressApp> | null = null;

function getSlackApp(): ReturnType<typeof createSlackExpressApp> {
	if (slackApp) return slackApp;

	slackApp = createSlackExpressApp(
		slackSigningSecret.value(),
		slackBotToken.value(),
	);

	const db = getFirestore();
	const memory = createFirestoreMemory(db, openaiProvider.embeddingModel);
	const configStore = new FirestoreConfigStore(db);
	const slackAdapter = slackApp.adapter(slackBotToken.value());

	slackApp.app.message(async ({ message }) => {
		if (message.subtype !== undefined) return;

		try {
			await handleSlackMessage({
				slack: slackAdapter,
				model: openaiProvider.mediumModel,
				channel: message.channel,
				messageTs: message.ts,
				threadTs: message.thread_ts,
				userId: message.user,
				botName: "My-Assistant",
				memory,
				configStore,
				webSearchTool: openaiProvider.webSearchTool,
			});
		} catch (error) {
			console.error("Agent loop failed:", error);
		}
	});

	return slackApp;
}

export const slackbot = onRequest(
	{
		secrets: [slackBotToken, slackSigningSecret, openaiApiKey],
		timeoutSeconds: 200,
		memory: "256MiB",
		invoker: "public",
	},
	(req, res) => {
		if (req.headers["x-slack-retry-num"]) {
			res.sendStatus(200);
			return;
		}
		getSlackApp().handler(req, res, () => {});
	},
);
