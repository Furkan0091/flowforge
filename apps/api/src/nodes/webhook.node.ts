import { registerNode } from "./registry";

export function registerWebhookNode(): void {
  registerNode({
    schema: {
      type: "webhook",
      category: "trigger",
      label: "Webhook Trigger",
      description: "Starts the workflow when an HTTP request hits the workflow's webhook endpoint.",
      icon: "webhook",
      color: "#38bdf8",
      outputAliases: ["webhook"],
      isTrigger: true,
      defaultConfig: {
        method: "POST",
        secret: "",
      },
      configFields: [
        {
          name: "method",
          label: "HTTP method",
          type: "select",
          options: [
            { label: "POST", value: "POST" },
            { label: "GET", value: "GET" },
            { label: "PUT", value: "PUT" },
          ],
          default: "POST",
        },
        {
          name: "secret",
          label: "Secret (optional)",
          type: "secret",
          placeholder: "Required in X-FlowForge-Signature header",
          help: "If set, requests must send the secret in the X-FlowForge-Signature header.",
          default: "",
        },
        {
          name: "url",
          label: "Webhook URL",
          type: "readonly",
          help: "Generated endpoint for this workflow. Saved when the workflow is saved.",
          default: "",
        },
      ],
    },
    handler: async (ctx) => {
      const payload = (ctx.context.inputs.webhook ?? {}) as Record<string, unknown>;
      const headers = (ctx.context.inputs.webhookHeaders ?? {}) as Record<string, unknown>;
      await ctx.log("info", "Webhook payload received", { payload });
      return { payload, headers, receivedAt: new Date().toISOString() };
    },
  });
}
