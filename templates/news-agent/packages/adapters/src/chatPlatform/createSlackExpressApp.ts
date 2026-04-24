import { App, ExpressReceiver } from "@slack/bolt";
import { SlackAdapter } from "./SlackAdapter";

/**
 * Creates a Bolt App backed by an ExpressReceiver, suitable for Firebase onRequest handlers.
 * Use this in composition roots so they don't need to import @slack/bolt directly.
 *
 * Returns:
 * - `handler` — the underlying Express app, ready to mount as an onRequest handler
 * - `app`     — the Bolt App instance (for registering message listeners)
 * - `adapter` — factory that creates a SlackAdapter from a bot token
 */
export function createSlackExpressApp(signingSecret: string, botToken: string) {
	const receiver = new ExpressReceiver({
		signingSecret,
		endpoints: "/events",
		processBeforeResponse: true,
	});

	const app = new App({ token: botToken, receiver });

	return {
		/** Express-compatible handler — pass directly to Firebase onRequest */
		handler: receiver.app as unknown as (
			req: unknown,
			res: unknown,
			next?: () => void,
		) => void,
		app,
		adapter: (token: string) => new SlackAdapter(app, token),
	};
}
