import { resolvePath, resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

interface SwitchCase {
  id?: string;
  label?: string;
  value?: string;
}

export function registerSwitchNode(): void {
  registerNode({
    schema: {
      type: "switch",
      category: "logic",
      label: "Switch",
      description:
        "Routes to one of several branches by comparing a variable against case values. The first matching case wins; if none match, the default branch runs.",
      icon: "shuffle",
      color: "#fbbf24",
      outputAliases: [],
      defaultConfig: {
        variable: "webhook.company",
        cases: [{ id: "case_1", label: "Example Corp", value: "Example Corp" }],
      },
      configFields: [
        {
          name: "variable",
          label: "Variable",
          type: "text",
          placeholder: "e.g. webhook.company or nodes.node_123.data.status",
          help: "Path into the execution context. {{ }} not required.",
          default: "",
        },
        {
          name: "cases",
          label: "Cases",
          type: "cases",
          help: "Each case is a branch. The value is compared (exact match) against the variable. First match wins; no match falls through to the default branch.",
          default: [],
        },
      ],
    },
    handler: async (ctx) => {
      const variable = String(ctx.node.config.variable ?? "").trim();
      if (!variable) {
        throw nodeError("Switch node requires a variable path", { code: "SWITCH_NO_VARIABLE" });
      }

      const actual = resolvePath(ctx.context, variable);
      const str = String(resolveTemplate(actual, ctx.context) ?? "");

      const cases = Array.isArray(ctx.node.config.cases) ? (ctx.node.config.cases as SwitchCase[]) : [];
      const matchedIdx = cases.findIndex((c) => {
        if (!c || typeof c !== "object") return false;
        const expected = String(resolveTemplate(c.value ?? "", ctx.context) ?? "");
        return expected === str;
      });
      const matched = matchedIdx >= 0 ? cases[matchedIdx] : null;
      const handle = matched ? String(matched.id ?? `c${matchedIdx + 1}`) : "default";

      await ctx.log(
        "info",
        `Switch evaluated → ${matched ? `case "${matched.label ?? matched.value}"` : "default branch"}`,
        { variable, value: str }
      );

      return {
        matched: handle,
        index: matchedIdx,
        value: str,
        cases: cases.map((c, i) => c?.id ?? `c${i + 1}`),
      };
    },
  });
}
