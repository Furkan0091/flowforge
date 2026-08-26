import { registerNode } from "./registry";

export function registerDelayNode(): void {
  registerNode({
    schema: {
      type: "delay",
      category: "logic",
      label: "Delay",
      description: "Pauses the workflow for a configured duration. Implemented as a delayed job, so workers are never blocked.",
      icon: "timer",
      color: "#94a3b8",
      outputAliases: [],
      defaultConfig: {
        durationMs: 1000,
      },
      configFields: [
        {
          name: "durationMs",
          label: "Duration (ms)",
          type: "number",
          placeholder: "e.g. 5000",
          help: "How long to wait before continuing.",
          default: 1000,
        },
      ],
    },
    handler: async (ctx) => {
      const durationMs = Math.max(0, Number(ctx.node.config.durationMs ?? 0));
      await ctx.log("info", `Delay complete after ${durationMs}ms`);
      return { durationMs, completedAt: new Date().toISOString() };
    },
  });
}
