import { prisma } from "../lib/prisma";
import { getRedisConnection } from "../lib/redis";
import { emailMode } from "./email.service";
import { env } from "../config/env";

export async function getIntegrationStatus() {
  let redisConnected = false;
  let postgresConnected = false;
  let redisError: string | undefined;

  try {
    const pong = await getRedisConnection().ping();
    redisConnected = pong === "PONG";
  } catch (err) {
    redisError = err instanceof Error ? err.message : "unreachable";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch {
    postgresConnected = false;
  }

  return {
    email: {
      mode: emailMode().mode,
      configured: emailMode().configured,
      description:
        emailMode().configured
          ? "Delivering real emails via SMTP"
          : emailMode().mode === "mock"
            ? "Mock mode — emails are recorded in execution logs, not delivered"
            : "SMTP mode selected but SMTP_HOST is not configured",
    },
    redis: {
      connected: redisConnected,
      error: redisError,
      description: redisConnected ? "Queue broker connected (BullMQ)" : "Not connected",
    },
    postgres: {
      connected: postgresConnected,
      description: postgresConnected ? "Primary database connected (Prisma)" : "Not connected",
    },
    webhooks: {
      enabled: true,
      baseUrl: env.webhookBaseUrl || "derived from incoming requests",
      description: "Public endpoints at POST /api/webhooks/:workflowId",
    },
    http: {
      enabled: true,
      description: "HTTP Request nodes execute real outbound requests",
    },
  };
}
