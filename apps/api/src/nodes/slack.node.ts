import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

export function registerSlackNode(): void {
  registerNode({
    schema: {
      type: "slack",
      category: "integration",
      label: "Slack",
      description: "Posts a message to a Slack channel via an incoming webhook URL.",
      icon: "send",
      color: "#e879f9",
      outputAliases: ["slack"],
      defaultConfig: {
        webhookUrl: "https://hooks.slack.com/services/...",
        message: "Hello from FlowForge — {{manual.name}}",
        timeoutMs: 10000,
      },
      configFields: [
        {
          name: "webhookUrl",
          label: "Webhook URL",
          type: "text",
          placeholder: "https://hooks.slack.com/services/T000/B000/XXXX",
          help: "Slack incoming webhook URL. Supports {{variable}} templates.",
          default: "",
        },
        {
          name: "message",
          label: "Message",
          type: "textarea",
          rows: 3,
          placeholder: "Hello from FlowForge — {{manual.name}}",
          help: "Posted as the Slack message text. Supports {{variable}} templates.",
          default: "",
        },
        {
          name: "timeoutMs",
          label: "Timeout (ms)",
          type: "number",
          default: 10000,
        },
      ],
    },
    handler: async (ctx) => {
      const config = ctx.node.config;
      const webhookUrl = String(resolveTemplate(config.webhookUrl ?? "", ctx.context) ?? "");
      if (!webhookUrl.trim()) {
        throw nodeError("Slack node requires a webhook URL", { code: "SLACK_NO_URL" });
      }
      if (!/^https:\/\//.test(webhookUrl)) {
        throw nodeError("Slack webhook URL must be an https:// URL", { code: "SLACK_BAD_URL" });
      }

      const message = String(resolveTemplate(config.message ?? "", ctx.context) ?? "");
      const timeoutMs = Math.max(1, Number(config.timeoutMs ?? 10000));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();

      try {
        let response: Response;
        try {
          response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
            signal: controller.signal,
          });
        } catch (err) {
          const aborted = err instanceof Error && err.name === "AbortError";
          throw nodeError(
            aborted ? `Slack request timed out after ${timeoutMs}ms` : `Network error: ${(err as Error).message}`,
            { code: aborted ? "SLACK_TIMEOUT" : "SLACK_NETWORK", retryable: true, details: { url: webhookUrl } }
          );
        }

        const duration = Date.now() - started;
        const raw = await response.text();
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          throw nodeError(`Slack returned HTTP ${response.status}`, {
            code: "SLACK_ERROR",
            retryable,
            details: { status: response.status, body: raw.slice(0, 500) },
          });
        }

        await ctx.log("info", `Slack message posted (${duration}ms)`);
        return { ok: true, status: response.status, duration, url: webhookUrl };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
