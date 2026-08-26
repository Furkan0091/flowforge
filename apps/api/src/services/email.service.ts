import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (env.emailMode !== "smtp") return null;
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface EmailResult {
  sent: boolean;
  mock: boolean;
  to: string;
  subject: string;
  messageId?: string;
  error?: string;
}

/**
 * Send an email.
 *
 * - With EMAIL_MODE=smtp and SMTP_HOST configured, real mail is delivered.
 * - Otherwise the message is logged (mock mode) and reported as unsent, so a
 *   developer is never misled into thinking real mail was delivered.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    logger.info("[email:mock] would send email", {
      to: msg.to,
      subject: msg.subject,
      from: msg.from ?? env.smtp.from,
    });
    return {
      sent: false,
      mock: true,
      to: msg.to,
      subject: msg.subject,
      error: env.emailMode === "smtp" ? "SMTP_HOST not configured" : "EMAIL_MODE=mock",
    };
  }

  try {
    const info = await t.sendMail({
      from: msg.from ?? env.smtp.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    return { sent: true, mock: false, to: msg.to, subject: msg.subject, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown SMTP error";
    logger.error("[email] send failed", { message });
    return { sent: false, mock: false, to: msg.to, subject: msg.subject, error: message };
  }
}

export function emailMode(): { mode: string; configured: boolean } {
  return {
    mode: env.emailMode,
    configured: env.emailMode === "smtp" && Boolean(env.smtp.host),
  };
}
