import {
	FirestoreConfigStore,
	NewsAPIAdapter,
	openaiProvider,
} from "@my-assistant/adapters";
import { dailyPlanner } from "@my-assistant/core";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import "../shared/init";
import { newsApiKey, openaiApiKey } from "../shared/secrets";

export const dailyPlannerFn = onSchedule(
	{
		schedule: "0 6 * * *",
		timeZone: "Asia/Seoul",
		secrets: [openaiApiKey, newsApiKey],
		timeoutSeconds: 300,
		memory: "512MiB",
	},
	async () => {
		const newsProvider = new NewsAPIAdapter(newsApiKey.value());
		const configStore = new FirestoreConfigStore(getFirestore());

		const channels = await configStore.getActiveChannels();
		console.log(
			`[dailyPlannerFn] Running for ${channels.length} active channels`,
		);

		for (const channelId of channels) {
			try {
				await dailyPlanner({
					model: openaiProvider.smallModel,
					channel: channelId,
					newsProvider,
					configStore,
				});
			} catch (err) {
				console.error(`[dailyPlannerFn] Failed for channel=${channelId}`, err);
			}
		}
	},
);
