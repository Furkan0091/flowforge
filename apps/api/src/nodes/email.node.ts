import { sendEmail } from "../services/email.service";
import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

export function registerEmailNode(): void {
  registerNode({
    schema: {
      type: "email",
      category: "action",
      label: "Send Email",
      description: "Sends an email via SMTP. Falls back to a clearly-labeled mock mode when SMTP is not configured.",
      icon: "mail",
      color: "#f472b6",
      outputAliases: ["email"],
      defaultConfig: {
        to: "",
        subject: "Notification from FlowForge",
        body: "Hello,\n\n{{webhook.payload}}\n\n— FlowForge",
      },
      configFields: [
        {
          name: "to",
          label: "To",
          type: "text",
          placeholder: "user@example.com",
          help: "Supports {{variables}}.",
          default: "",
        },
        {
          name: "subject",
          label: "Subject",
          type: "text",
          default: "Notification from FlowForge",
        },
        {
          name: "body",
          label: "Body",
          type: "textarea",
          rows: 6,
          default: "",
        },
      ],
    },
    handler: async (ctx) => {
      const context = ctx.context;
      const to = String(resolveTemplate(ctx.node.config.to ?? "", context) ?? "").trim();
      const subject = String(resolveTemplate(ctx.node.config.subject ?? "", context) ?? "");
      const body = String(resolveTemplate(ctx.node.config.body ?? "", context) ?? "");

      if (!to) {
        throw nodeError("Send Email requires a recipient", { code: "EMAIL_NO_RECIPIENT" });
      }

      const result = await sendEmail({ to, subject, body });
      await ctx.log(
        result.sent ? "info" : "warn",
        result.sent ? `Email sent to ${to}` : `Email NOT sent to ${to} (${result.error})`
      );

      if (!result.sent && !result.mock) {
        throw nodeError(`Email delivery failed: ${result.error}`, {
          code: "EMAIL_SEND_FAILED",
          retryable: true,
          details: result,
        });
      }

      return { ...result, to, subject };
    },
  });
}
