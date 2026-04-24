import { type Tool, tool } from "ai";
import { z } from "zod";

export const HOURS = [
	"07",
	"08",
	"09",
	"10",
	"11",
	"12",
	"13",
	"14",
	"15",
	"16",
	"17",
	"18",
	"19",
	"20",
	"21",
	"22",
	"23",
] as const;

export type Hour = (typeof HOURS)[number];

export function createPlannerTools(params: {
	onUpdate: (schedule: Record<string, number>) => void;
}): Record<string, Tool> {
	return {
		submitSchedule: tool({
			description:
				"Submit the final hourly article assignments. Call this once with all 17 slots filled.",
			inputSchema: z.object(
				Object.fromEntries(
					HOURS.map((h) => [
						h,
						z
							.number()
							.int()
							.min(0)
							.describe(
								`0-based index of the article assigned to the ${h}:00 slot`,
							),
					]),
				),
			),
			execute: async (schedule) => {
				params.onUpdate(schedule as Record<string, number>);
				return "Schedule submitted.";
			},
		}),
	};
}
