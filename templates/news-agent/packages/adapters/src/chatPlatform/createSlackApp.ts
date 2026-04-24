import { App } from "@slack/bolt";
import { SlackAdapter } from "./SlackAdapter";

/**
 * Creates a simple Bolt App (no receiver) and a SlackAdapter.
 * Use this for scheduled functions or any non-HTTP context.
 */
export function createSlackApp(botToken: string): {
	app: App;
	adapter: SlackAdapter;
} {
	const app = new App({
		token: botToken,
		signingSecret: "placeholder",
	});
	return { app, adapter: new SlackAdapter(app, botToken) };
}
