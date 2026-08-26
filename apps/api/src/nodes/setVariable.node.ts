import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

export function registerSetVariableNode(): void {
  registerNode({
    schema: {
      type: "set_variable",
      category: "data",
      label: "Set Variable",
      description: "Stores a value in the execution context for later nodes to reference with {{variables.name}}.",
      icon: "variable",
      color: "#22d3ee",
      outputAliases: [],
      defaultConfig: {
        variable: "customer_name",
        value: "{{webhook.name}}",
      },
      configFields: [
        {
          name: "variable",
          label: "Variable name",
          type: "text",
          placeholder: "e.g. customer_name",
          default: "",
        },
        {
          name: "value",
          label: "Value",
          type: "text",
          placeholder: "e.g. {{webhook.name}}",
          default: "",
        },
      ],
    },
    handler: async (ctx) => {
      const name = String(ctx.node.config.variable ?? "").trim();
      if (!name) {
        throw nodeError("Set Variable requires a variable name", { code: "VARIABLE_NO_NAME" });
      }
      const value = resolveTemplate(ctx.node.config.value, ctx.context);
      ctx.context.variables[name] = value;
      await ctx.log("info", `Set variable "${name}"`);
      return { variable: name, value };
    },
  });
}
