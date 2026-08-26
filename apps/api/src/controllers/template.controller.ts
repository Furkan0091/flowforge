import { Request, Response } from "express";
import { TEMPLATES } from "../templates";
import { createWorkflow } from "../services/workflow.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

export const listTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const data = TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    nodeCount: t.definition.nodes.length,
    nodeTypes: [...new Set(t.definition.nodes.map((n) => n.type))],
  }));
  res.json({ success: true, data: { templates: data } });
});

export const useTemplate = asyncHandler(async (req: Request, res: Response) => {
  const template = TEMPLATES.find((t) => t.id === req.body.templateId);
  if (!template) throw ApiError.notFound("TEMPLATE_NOT_FOUND", "Template not found");
  const workflow = await createWorkflow(req.user!.id, {
    name: template.name,
    description: template.description,
    definition: template.definition,
  });
  res.status(201).json({ success: true, data: { workflowId: workflow.id } });
});
