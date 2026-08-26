import { registerNode } from "./registry";

export function registerManualNode(): void {
  registerNode({
    schema: {
      type: "manual",
      category: "trigger",
      label: "Manual Trigger",
      description: "Starts the workflow when the Run button is pressed. Optional JSON payload.",
      icon: "play",
      color: "#34d399",
      outputAliases: ["manual"],
      isTrigger: true,
      defaultConfig: {
        description: "Manual run",
      },
      configFields: [
        {
          name: "description",
          label: "Description",
          type: "text",
          placeholder: "What does this manual run represent?",
          default: "Manual run",
        },
      ],
    },
    handler: async (ctx) => {
      const payload = (ctx.context.inputs.manual ?? {}) as Record<string, unknown>;
      await ctx.log("info", "Manual trigger started", { payload });
      return { payload, startedAt: new Date().toISOString() };
    },
  });
}
