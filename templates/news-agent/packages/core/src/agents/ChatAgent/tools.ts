import { type Tool, tool } from "ai";
import { z } from "zod";
import type { IConfigStore } from "../../config/types";
import type { IAgentMemory } from "../../memory/types";
import type { IChatPlatform } from "../../types/chatPlatform";

// ---------------------------------------------------------------------------
// Config tools
// ---------------------------------------------------------------------------

const CONFIG_FIELD_REGISTRY = [
	{
		path: "user.language",
		type: "string",
		description: "User's preferred reply language",
	},
	{
		path: "user.speechStyle",
		type: "string",
		description: "User's preferred speech style",
	},
	{
		path: "channel.news.keywords",
		type: "string[]",
		description: "News search keywords for this channel",
	},
	{
		path: "channel.news.sortBy",
		type: "enum(relevancy|popularity|publishedAt)",
		description: "News article sort order for this channel",
	},
	{
		path: "channel.news.outputLanguage",
		type: "string",
		description: "News summary output language for this channel",
	},
];

interface ConfigContext {
	configStore: IConfigStore;
	userId?: string;
	channelId: string;
}

async function getFieldValue(
	ctx: ConfigContext,
	path: string,
): Promise<string | null> {
	const { configStore, userId, channelId } = ctx;
	switch (path) {
		case "user.language":
			if (!userId) return null;
			return (await configStore.getUserPreferences(userId))?.language ?? null;
		case "user.speechStyle":
			if (!userId) return null;
			return (
				(await configStore.getUserPreferences(userId))?.speechStyle ?? null
			);
		case "channel.news.keywords": {
			const kw = (await configStore.getNewsConfig(channelId))?.keywords;
			return kw ? kw.join(", ") : null;
		}
		case "channel.news.sortBy":
			return (await configStore.getNewsConfig(channelId))?.sortBy ?? null;
		case "channel.news.outputLanguage":
			return (
				(await configStore.getNewsConfig(channelId))?.outputLanguage ?? null
			);
		default:
			return `unknown field: ${path}`;
	}
}

async function setFieldValue(
	ctx: ConfigContext,
	path: string,
	value: unknown,
): Promise<void> {
	const { configStore, userId, channelId } = ctx;
	const clear = value === null;
	switch (path) {
		case "user.language":
			if (!userId) throw new Error("userId required for user.* fields");
			clear
				? await configStore.clearUserLanguage(userId)
				: await configStore.setUserLanguage(userId, String(value));
			break;
		case "user.speechStyle":
			if (!userId) throw new Error("userId required for user.* fields");
			clear
				? await configStore.clearUserSpeechStyle(userId)
				: await configStore.setUserSpeechStyle(userId, String(value));
			break;
		case "channel.news.keywords":
			clear
				? await configStore.clearNewsKeywords(channelId)
				: await configStore.setNewsKeywords(
						channelId,
						(value as string[]).map(String),
					);
			break;
		case "channel.news.sortBy":
			clear
				? await configStore.clearNewsSortBy(channelId)
				: await configStore.setNewsSortBy(
						channelId,
						value as "relevancy" | "popularity" | "publishedAt",
					);
			break;
		case "channel.news.outputLanguage":
			clear
				? await configStore.clearNewsOutputLanguage(channelId)
				: await configStore.setNewsOutputLanguage(channelId, String(value));
			break;
		default:
			throw new Error(`Unknown config field: ${path}`);
	}
}

export function createConfigTools(ctx: ConfigContext): Record<string, Tool> {
	const availableFields = CONFIG_FIELD_REGISTRY.filter(
		(f) => !(f.path.startsWith("user.") && !ctx.userId),
	);

	return {
		getConfigFields: tool({
			description:
				"List all available config fields with their types and descriptions. Call this first when you need to read or modify any configuration.",
			inputSchema: z.object({}),
			execute: async () =>
				availableFields
					.map((f) => `${f.path} (${f.type}) — ${f.description}`)
					.join("\n"),
		}),

		getConfig: tool({
			description:
				"Read current values of specific config fields. Use dot-notation paths returned by getConfigFields. Supports wildcard * for dynamic segments.",
			inputSchema: z.object({
				fields: z
					.array(z.string())
					.min(1)
					.describe(
						'Field paths to read, e.g. ["user.language", "channel.news.keywords"]',
					),
			}),
			execute: async ({ fields }) => {
				const lines = await Promise.all(
					fields.map(async (f) => {
						const val = await getFieldValue(ctx, f);
						return `${f}: ${val ?? "(not set)"}`;
					}),
				);
				return lines.join("\n");
			},
		}),

		setConfig: tool({
			description:
				"Update or clear config fields. Pass field-value pairs. Set a field to null to clear it and restore the default.",
			inputSchema: z.object({
				fields: z
					.record(
						z.string(),
						z.union([z.string(), z.array(z.string()), z.null()]),
					)
					.describe(
						'Field paths and new values, e.g. {"user.language": "Korean", "channel.news.sortBy": null}',
					),
			}),
			execute: async ({ fields }) => {
				const results: string[] = [];
				for (const [path, value] of Object.entries(fields)) {
					try {
						await setFieldValue(ctx, path, value);
						results.push(`${path}: ${value === null ? "cleared" : "updated"}`);
					} catch (e) {
						results.push(`${path}: error — ${(e as Error).message}`);
					}
				}
				return results.join("\n");
			},
		}),
	};
}

// ---------------------------------------------------------------------------
// Memory tools
// ---------------------------------------------------------------------------

export function createMemoryTools(memory: IAgentMemory): Record<string, Tool> {
	return {
		memory: tool({
			description: `Read from and search long-term semantic memory.
- recall: get recent context summaries (call this first before deciding)
- search: find summaries relevant to a topic keyword`,
			inputSchema: z.object({
				action: z.enum(["recall", "search"]),
				limit: z.number().optional().describe("Max results for recall/search"),
				query: z
					.string()
					.optional()
					.describe("For search: topic keyword to look up"),
			}),
			execute: async ({ action, query, limit }) => {
				if (action === "recall") {
					const results = await memory.recall(limit ?? 5);
					return results.length > 0
						? results.join("\n")
						: "No past context found.";
				}
				if (action === "search") {
					if (!query) return "query is required for search";
					const results = await memory.search(query, limit ?? 5);
					return results.length > 0
						? results.join("\n")
						: "No matching context found.";
				}
				return "Unknown action.";
			},
		}),
	};
}

// ---------------------------------------------------------------------------
// Slack tools
// ---------------------------------------------------------------------------

interface SlackParams {
	channel: string;
	messageTs: string;
	threadTs?: string;
}

export function createSlackTools(
	slack: IChatPlatform,
	params: SlackParams,
): Record<string, Tool> {
	return {
		slackSearch: tool({
			description:
				"Search past Slack messages for specific content or quotes. Use this when you need actual message text, not just topic summaries.",
			inputSchema: z.object({
				query: z.string().describe("Search query for Slack messages"),
			}),
			execute: async ({ query }) => {
				const results = await slack.searchMessages(query);
				return results && results.length > 0
					? results.join("\n")
					: "No messages found.";
			},
		}),

		sendMessage: tool({
			description:
				"Send a message to the current Slack channel (always in thread).",
			inputSchema: z.object({
				text: z.string().describe("The message text to send"),
			}),
			execute: async ({ text }) => {
				await slack.sendThreadMessage(
					params.channel,
					params.threadTs ?? params.messageTs,
					text,
				);
				return "Message sent successfully.";
			},
		}),

		addReaction: tool({
			description: "Add an emoji reaction to the current message.",
			inputSchema: z.object({
				emoji: z
					.string()
					.describe(
						"The emoji name (without colons, e.g., 'eyes', 'heavy_check_mark')",
					),
			}),
			execute: async ({ emoji }) => {
				await slack.addReaction(
					params.channel,
					params.messageTs,
					emoji.replace(/^:|:$/g, ""),
				);
				return "Reaction added successfully.";
			},
		}),
	};
}

// ---------------------------------------------------------------------------
// Web search tool
// ---------------------------------------------------------------------------

export function createWebSearchTool(webSearch: {
	name: string;
	instance: Tool;
}): Record<string, Tool> {
	return { [webSearch.name]: webSearch.instance };
}
