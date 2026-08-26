import { CONDITION_OPERATORS, evaluateCondition } from "../engine/conditions";
import { resolvePath } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

export function registerConditionNode(): void {
  registerNode({
    schema: {
      type: "condition",
      category: "logic",
      label: "Condition",
      description: "Evaluates a variable against an operator and branches to the true or false path.",
      icon: "git-branch",
      color: "#fbbf24",
      outputAliases: [],
      branchHandles: ["true", "false"],
      defaultConfig: {
        variable: "webhook.email",
        operator: "contains",
        value: "@gmail.com",
      },
      configFields: [
        {
          name: "variable",
          label: "Variable",
          type: "text",
          placeholder: "e.g. webhook.email or nodes.node_123.data.count",
          help: "Path into the execution context. {{ }} not required.",
          default: "",
        },
        {
          name: "operator",
          label: "Operator",
          type: "select",
          options: CONDITION_OPERATORS.map((op) => ({ label: op, value: op })),
          default: "contains",
        },
        {
          name: "value",
          label: "Comparison value",
          type: "text",
          placeholder: "e.g. @gmail.com",
          default: "",
        },
      ],
    },
    handler: async (ctx) => {
      const variable = String(ctx.node.config.variable ?? "").trim();
      const operator = String(ctx.node.config.operator ?? "equals").trim();
      const expected = ctx.node.config.value ?? "";

      if (!variable) {
        throw nodeError("Condition node requires a variable path", { code: "CONDITION_NO_VARIABLE" });
      }
      if (!CONDITION_OPERATORS.includes(operator as (typeof CONDITION_OPERATORS)[number])) {
        throw nodeError(`Unknown condition operator: ${operator}`, { code: "CONDITION_BAD_OPERATOR" });
      }

      const actual = resolvePath(ctx.context, variable);
      const { result, reason } = evaluateCondition(operator as never, actual, expected);

      await ctx.log("info", `Condition evaluated → ${result ? "TRUE" : "FALSE"}`, {
        variable,
        operator,
        reason,
      });

      return {
        result,
        variable,
        operator,
        value: actual,
        reason,
        evaluatedAt: new Date().toISOString(),
      };
    },
  });
}
