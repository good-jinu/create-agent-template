import { defineSecret } from "firebase-functions/params";

export const slackBotToken = defineSecret("SLACK_BOT_TOKEN");
export const slackSigningSecret = defineSecret("SLACK_SIGNING_SECRET");
export const openaiApiKey = defineSecret("OPENAI_API_KEY");
export const newsApiKey = defineSecret("NEWS_API_KEY");
