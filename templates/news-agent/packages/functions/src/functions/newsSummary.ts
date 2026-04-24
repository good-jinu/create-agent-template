import {
	createSlackApp,
	FirestoreConfigStore,
	NewsAPIAdapter,
	openaiProvider,
	ScraperAdapter,
} from "@my-assistant/adapters";
import { sendNewsSummary } from "@my-assistant/core";
import { getFirestore } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import "../shared/init";
import { newsApiKey, openaiApiKey, slackBotToken } from "../shared/secrets";

// Set via: firebase functions:params:set NEWS_SUMMARY_CHANNEL_ID=<channel-id>
const newsSummaryChannel = defineString("NEWS_SUMMARY_CHANNEL_ID", {
	default: "general",
	description: "Slack channel ID to post the hourly news summary",
});

export const newsSummary = onSchedule(
	{
		schedule: "43 7-23 * * *",
		timeZone: "Asia/Seoul",
		secrets: [slackBotToken, openaiApiKey, newsApiKey],
		timeoutSeconds: 120,
		memory: "256MiB",
	},
	async () => {
		const { adapter: slack } = createSlackApp(slackBotToken.value());
		const newsProvider = new NewsAPIAdapter(newsApiKey.value());
		const scraper = new ScraperAdapter();
		const configStore = new FirestoreConfigStore(getFirestore());

		await sendNewsSummary({
			slack,
			model: openaiProvider.smallModel,
			channel: newsSummaryChannel.value(),
			newsProvider,
			scraper,
			configStore,
			now: new Date(),
		});
	},
);
