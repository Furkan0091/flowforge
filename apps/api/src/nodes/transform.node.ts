import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

export function registerTransformNode(): void {
  registerNode({
    schema: {
      type: "transform",
      category: "data",
      label: "Transform Data",
      description: "Builds a new data structure from the execution context using {{variables}}.",
      icon: "wand",
      color: "#fb923c",
      outputAliases: ["transform"],
      defaultConfig: {
        mode: "mapping",
        output: { email: "{{webhook.email}}", company: "{{webhook.company}}" },
        template: "",
      },
      configFields: [
        {
          name: "mode",
          label: "Mode",
          type: "select",
          options: [
            { label: "Field mapping", value: "mapping" },
            { label: "Raw template", value: "template" },
          ],
          default: "mapping",
        },
        {
          name: "output",
          label: "Output mapping",
          type: "object",
          help: "Object whose values support {{variables}}, e.g. { \"email\": \"{{webhook.email}}\" }.",
          default: {},
        },
        {
          name: "template",
          label: "Template",
          type: "code",
          rows: 5,
          help: "JSON string with {{variables}}. Parsed as JSON when possible.",
          default: "",
          dependsOn: { field: "mode", equals: "template" },
        },
      ],
    },
    handler: async (ctx) => {
      const mode = String(ctx.node.config.mode ?? "mapping");

      if (mode === "template") {
        const raw = String(ctx.node.config.template ?? "");
        const resolved = String(resolveTemplate(raw, ctx.context) ?? "");
        let data: unknown = resolved;
        try {
          data = JSON.parse(resolved);
        } catch {
          // keep raw string
        }
        await ctx.log("info", "Transform applied (template mode)");
        return { data };
      }

      const outputConfig = ctx.node.config.output;
      if (!outputConfig || typeof outputConfig !== "object" || Array.isArray(outputConfig)) {
        throw nodeError("Transform node requires an output mapping object", { code: "TRANSFORM_BAD_OUTPUT" });
      }
      const data = resolveTemplate(outputConfig, ctx.context);
      await ctx.log("info", "Transform applied (mapping mode)");
      return { data };
    },
  });
}
