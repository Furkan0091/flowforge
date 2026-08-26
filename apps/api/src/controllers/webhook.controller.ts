import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { startExecution } from "../services/execution.service";
import { asyncHandler } from "../utils/asyncHandler";
import { WorkflowDefinition } from "../nodes/types";

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(", ");
  }
  return out;
}

export const receiveWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { webhook: true, versions: { where: { isActive: true }, take: 1 } },
  });
  if (!workflow || workflow.status !== "enabled") {
    throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found or disabled");
  }
  const definition = (workflow.versions[0]?.definition ?? { nodes: [] }) as unknown as WorkflowDefinition;
  const webhookNode = definition.nodes.find((n) => n.type === "webhook");
  if (!webhookNode) {
    throw ApiError.badRequest("NO_WEBHOOK_TRIGGER", "This workflow has no webhook trigger node");
  }

  const method = workflow.webhook?.method ?? "POST";
  if (req.method !== method) {
    throw ApiError.badRequest("METHOD_NOT_ALLOWED", `This webhook accepts ${method} requests only`);
  }

  const secret = typeof webhookNode.config.secret === "string" ? webhookNode.config.secret : "";
  if (secret) {
    const provided = req.headers["x-flowforge-signature"];
    if (!provided || provided !== secret) {
      throw ApiError.unauthorized("INVALID_SIGNATURE", "Invalid webhook signature");
    }
  }

  const payload = req.body ?? {};
  const execution = await startExecution({
    workflowId: workflow.id,
    userId: workflow.userId,
    triggerType: "webhook",
    inputs: {
      webhook: payload,
      webhookHeaders: sanitizeHeaders(req.headers as Record<string, unknown>),
    },
  });

  res.status(202).json({
    success: true,
    data: {
      executionId: execution.executionId,
      status: execution.status,
      message: "Workflow triggered",
    },
  });
});
