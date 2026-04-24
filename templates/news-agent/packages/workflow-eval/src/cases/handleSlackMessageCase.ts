import { handleSlackMessage } from "@my-assistant/core";
import type {
	MockChatMessageRecord,
	MockReactionRecord,
} from "../mockModules/mockChatPlatform";
import { MockChatPlatform } from "../mockModules/mockChatPlatform";
import { MockConfigStore } from "../mockModules/mockConfigStore";
import { MockAgentMemory } from "../mockModules/mockMemory";
import { resolveProvider } from "../utils/provider";
import type { HandleSlackMessageCaseDefinition } from "./definitions";

export interface HandleSlackMessageCaseArtifact {
	kind: "handleSlackMessage";
	id: string;
	inputText: string;
	outputs: {
		messages: MockChatMessageRecord[];
		reactions: MockReactionRecord[];
	};
	storedMemory: string[];
}

export async function runHandleSlackMessageCase(
	caseDefinition: HandleSlackMessageCaseDefinition,
): Promise<HandleSlackMessageCaseArtifact> {
	const provider = resolveProvider(caseDefinition.config.provider);
	const baseChannelMessages =
		caseDefinition.input.filter((row) => row.kind === "slack_message") ?? [];
	const baseThreadMessages = baseChannelMessages;
	const seededMessages = baseChannelMessages.map((message, index) =>
		index === 0
			? { ...message, text: caseDefinition.config.messageText }
			: message,
	);
	const seededThreadMessages = baseThreadMessages.map((message, index) =>
		index === 0
			? { ...message, text: caseDefinition.config.messageText }
			: message,
	);
	const slack = new MockChatPlatform({
		botUserId: "UBOT0000001",
		messagesByChannel: {
			[caseDefinition.config.channel]: seededMessages,
		},
		threadMessages: caseDefinition.config.threadTs
			? {
					[caseDefinition.config.threadTs]: seededThreadMessages,
				}
			: {
					[caseDefinition.config.messageTs]: seededThreadMessages,
				},
		userNames: Object.fromEntries(
			caseDefinition.input
				.filter((row) => row.kind === "slack_message")
				.map((row) => [row.user, row.userName] as const),
		),
	});
	const memory = new MockAgentMemory();
	const configStore = new MockConfigStore({
		userPreferences: {
			[caseDefinition.config.userId]: {
				language: "English",
				speechStyle: "clear and concise",
			},
		},
	});

	await handleSlackMessage({
		slack,
		model: provider.smallModel,
		userId: caseDefinition.config.userId,
		channel: caseDefinition.config.channel,
		messageTs: caseDefinition.config.messageTs,
		threadTs: caseDefinition.config.threadTs,
		botName: caseDefinition.config.botName,
		memory,
		configStore,
		webSearchTool: provider.webSearchTool,
	});

	return {
		kind: "handleSlackMessage",
		id: caseDefinition.id,
		inputText: caseDefinition.config.messageText,
		outputs: {
			messages: slack.sentMessages,
			reactions: slack.reactions,
		},
		storedMemory: memory.storedEntries,
	};
}
