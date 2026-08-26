import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";

export function registerLogNode(): void {
  registerNode({
    schema: {
      type: "log",
      category: "action",
      label: "Log Message",
      description: "Writes a message to the execution log. Useful for debugging and failure branches.",
      icon: "terminal",
      color: "#a3e635",
      outputAliases: [],
      defaultConfig: {
        level: "info",
        message: "{{webhook.name}} rejected: invalid email",
      },
      configFields: [
        {
          name: "level",
          label: "Level",
          type: "select",
          options: [
            { label: "info", value: "info" },
            { label: "warn", value: "warn" },
            { label: "error", value: "error" },
            { label: "debug", value: "debug" },
          ],
          default: "info",
        },
        {
          name: "message",
          label: "Message",
          type: "textarea",
          rows: 3,
          placeholder: "Supports {{variables}}.",
          default: "",
        },
      ],
    },
    handler: async (ctx) => {
      const level = String(ctx.node.config.level ?? "info") as "info" | "warn" | "error" | "debug";
      const message = String(resolveTemplate(ctx.node.config.message ?? "", ctx.context) ?? "");
      await ctx.log(level, message || "(empty log message)");
      return { message, level };
    },
  });
}
