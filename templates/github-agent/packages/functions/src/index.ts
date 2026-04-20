import type { MessageContext } from "@code-insight/adapters";
// import { ollamaProvider } from "@code-insight/adapters";
import {
	GitHubAPIAdapter,
	geminiProvider,
	SlackAdapter,
} from "@code-insight/adapters";
import { AnalyzeComplexityWorkflow } from "@code-insight/core";
import { App, ExpressReceiver } from "@slack/bolt";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

// ─── Firebase Secrets ─────────────────────────────────────────────
const slackBotToken = defineSecret("SLACK_BOT_TOKEN");
const slackSigningSecret = defineSecret("SLACK_SIGNING_SECRET");
const geminiApiKey = defineSecret("GOOGLE_GENERATIVE_AI_API_KEY");
const githubToken = defineSecret("GITHUB_TOKEN");

// ─── Configuration ────────────────────────────────────────────────
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? "your-org";
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

// ─── Event Handler: message in watched channel ────────────────────
slackApp.message(async ({ message }) => {
	if (message.subtype !== undefined) return;
	if (message.channel !== SLACK_CHANNEL_ID) return;

	const botToken = slackBotToken.value();
	const slackAdapter = new SlackAdapter(slackApp, botToken);

	try {
		await slackAdapter.addReaction(message.channel, message.ts, "eyes");

		const repoService = new GitHubAPIAdapter({
			token: githubToken.value(),
			owner: GITHUB_OWNER,
		});

		const workflow = new AnalyzeComplexityWorkflow(
			geminiProvider.largeModel,
			repoService,
		);
		const result = await workflow.run(message.text ?? "", {
			maxInvestigationSteps: 5,
		});

		const context: MessageContext = {
			channelId: message.channel,
			messageTs: message.ts,
			userId: message.user ?? "unknown",
			text: message.text ?? "",
		};

		await slackAdapter.sendReport(
			context,
			result.report,
			result.ownerLookup?.primaryOwner,
		);

		await slackAdapter.removeReaction(message.channel, message.ts, "eyes");
		await slackAdapter.addReaction(
			message.channel,
			message.ts,
			"white_check_mark",
		);
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

// ─── Action Handler: "Request Review from Owner" button ───────────
slackApp.action("request_review_action", async ({ ack, body, client }) => {
	await ack();

	try {
		const actionBody = body as unknown as Record<
			string,
			Record<string, unknown>
		>;
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

// ─── Export as Firebase HTTP Function ─────────────────────────────
export const slackbot = onRequest(
	{
		secrets: [slackBotToken, slackSigningSecret, geminiApiKey, githubToken],
		timeoutSeconds: 120,
		memory: "512MiB",
	},
	receiver.app,
);
