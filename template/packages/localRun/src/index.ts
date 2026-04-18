import { env, exit } from "node:process";
import {
	GitHubAPIAdapter,
	SlackAdapter,
	ollamaProvider,
} from "@code-insight/adapters";
import type { MessageContext } from "@code-insight/adapters";
import { AnalyzeComplexityWorkflow } from "@code-insight/core";
import { App, SocketModeReceiver } from "@slack/bolt";

// ─── Required env ─────────────────────────────────────────────────
const SLACK_APP_TOKEN = env.SLACK_APP_TOKEN;
const SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN;
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const GITHUB_OWNER = env.GITHUB_OWNER ?? "";
const SLACK_CHANNEL_ID = env.SLACK_CHANNEL_ID ?? "";

if (!SLACK_APP_TOKEN) {
	console.error("Missing SLACK_APP_TOKEN (xapp-...). Generate one at: Slack App Settings → Basic Information → App-Level Tokens (scope: connections:write)");
	exit(1);
}
if (!SLACK_BOT_TOKEN) {
	console.error("Missing SLACK_BOT_TOKEN");
	exit(1);
}
if (!GITHUB_TOKEN) {
	console.error("Missing GITHUB_TOKEN");
	exit(1);
}
if (!SLACK_CHANNEL_ID) {
	console.error("Missing SLACK_CHANNEL_ID — set the channel ID to watch (e.g. C01234567)");
	exit(1);
}

// ─── Slack App (Socket Mode) ───────────────────────────────────────
const receiver = new SocketModeReceiver({
	appToken: SLACK_APP_TOKEN,
});

const app = new App({
	token: SLACK_BOT_TOKEN,
	receiver,
});

const slackAdapter = new SlackAdapter(app, SLACK_BOT_TOKEN);

const repoService = new GitHubAPIAdapter({
	token: GITHUB_TOKEN,
	owner: GITHUB_OWNER,
});

// ─── Event: message in watched channel ───────────────────────────
app.message(async ({ message }) => {
	if (message.subtype !== undefined) return;
	if (message.channel !== SLACK_CHANNEL_ID) return;

	const context: MessageContext = {
		channelId: message.channel,
		messageTs: message.ts,
		userId: message.user ?? "unknown",
		text: message.text ?? "",
	};

	try {
		await slackAdapter.addReaction(message.channel, message.ts, "eyes");

		const workflow = new AnalyzeComplexityWorkflow(
			ollamaProvider.largeModel,
			repoService,
		);

		const result = await workflow.run(message.text ?? "", {
			maxInvestigationSteps: Number(env.MAX_INVESTIGATION_STEPS ?? "5"),
		});

		await slackAdapter.sendReport(
			context,
			result.report,
			result.ownerLookup?.primaryOwner,
		);

		await slackAdapter.removeReaction(message.channel, message.ts, "eyes");
		await slackAdapter.addReaction(message.channel, message.ts, "white_check_mark");
	} catch (error) {
		console.error("Analysis failed:", error);
		await slackAdapter.removeReaction(message.channel, message.ts, "eyes");
		await slackAdapter.addReaction(message.channel, message.ts, "warning");
		await slackAdapter.sendThreadMessage(
			message.channel,
			message.ts,
			`❌ Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
		);
	}
});

// ─── Action: "Request Review" button ──────────────────────────────
app.action("request_review_action", async ({ ack, body, client }) => {
	await ack();

	try {
		const actionBody = body as unknown as Record<string, Record<string, unknown>>;
		const actions = actionBody.actions as unknown as Array<{ value: string }>;
		const ownerInfo = JSON.parse(actions[0].value);

		const channel = (actionBody.channel as unknown as { id: string })?.id;
		const messageTs = (actionBody.message as unknown as { ts: string })?.ts;

		const mention = ownerInfo.slackUserId
			? `<@${ownerInfo.slackUserId}>`
			: `*${ownerInfo.name}* (GitHub: @${ownerInfo.githubUsername})`;

		await client.chat.postMessage({
			channel,
			thread_ts: messageTs,
			text: `🔔 ${mention} — A planner has requested your review on the complexity analysis above. Could you share your thoughts on the feasibility and potential risks?`,
		});
	} catch (error) {
		console.error("Review request failed:", error);
	}
});

// ─── Start ────────────────────────────────────────────────────────
await app.start();
console.log(`⚡ Code Insight (local) is running via Socket Mode`);
console.log(`   Mention @Code Insight (Local) in Slack to analyze a feature`);
