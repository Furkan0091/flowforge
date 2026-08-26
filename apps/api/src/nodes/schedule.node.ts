import { registerNode } from "./registry";

export const SCHEDULE_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 09:00", value: "0 9 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly on Monday 09:00", value: "0 9 * * 1" },
  { label: "Custom cron", value: "custom" },
];

export function registerScheduleNode(): void {
  registerNode({
    schema: {
      type: "schedule",
      category: "trigger",
      label: "Schedule Trigger",
      description: "Starts the workflow on a recurring schedule using a cron expression.",
      icon: "clock",
      color: "#a78bfa",
      outputAliases: ["schedule"],
      isTrigger: true,
      defaultConfig: {
        cron: "0 * * * *",
        timezone: "UTC",
      },
      configFields: [
        {
          name: "cron",
          label: "Schedule",
          type: "select",
          options: SCHEDULE_PRESETS.map((p) => ({ label: p.label, value: p.value })),
          default: "0 * * * *",
        },
        {
          name: "cronCustom",
          label: "Custom cron expression",
          type: "text",
          placeholder: "e.g. */15 * * * *",
          help: "Used when Schedule is set to Custom cron. Five fields: minute hour day month weekday.",
          default: "",
        },
        {
          name: "timezone",
          label: "Timezone",
          type: "text",
          placeholder: "e.g. UTC, Europe/Berlin",
          default: "UTC",
        },
      ],
    },
    handler: async (ctx) => {
      const scheduled = (ctx.context.inputs.schedule ?? {}) as Record<string, unknown>;
      await ctx.log("info", "Schedule triggered", { scheduled });
      return { scheduledAt: scheduled.scheduledAt ?? new Date().toISOString(), payload: scheduled.payload ?? {} };
    },
  });
}
