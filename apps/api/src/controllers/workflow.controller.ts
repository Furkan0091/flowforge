import { Request, Response } from "express";
import * as workflowService from "../services/workflow.service";
import { asyncHandler } from "../utils/asyncHandler";

export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.createWorkflow(req.user!.id, req.body);
  res.status(201).json({ success: true, data: { workflow } });
});

export const listWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const workflows = await workflowService.listWorkflows(req.user!.id);
  res.json({ success: true, data: { workflows } });
});

export const getWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.getWorkflow(req.user!.id, req.params.id);
  res.json({ success: true, data: { workflow } });
});

export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.updateWorkflow(req.user!.id, req.params.id, req.body);
  res.json({ success: true, data: { workflow } });
});

export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const result = await workflowService.deleteWorkflow(req.user!.id, req.params.id);
  res.json({ success: true, data: result });
});

export const duplicateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.duplicateWorkflow(req.user!.id, req.params.id);
  res.status(201).json({ success: true, data: { workflow } });
});

export const enableWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.setWorkflowStatus(req.user!.id, req.params.id, "enabled");
  res.json({ success: true, data: { workflow } });
});

export const disableWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.setWorkflowStatus(req.user!.id, req.params.id, "disabled");
  res.json({ success: true, data: { workflow } });
});

export const executeWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const execution = await workflowService.runWorkflowNow(req.user!.id, req.params.id, req.body?.payload);
  res.status(202).json({
    success: true,
    data: {
      executionId: execution.executionId,
      status: execution.status,
      message: "Workflow execution queued",
    },
  });
});

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  const versions = await workflowService.listVersions(req.user!.id, req.params.id);
  res.json({ success: true, data: { versions } });
});

export const activateVersion = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await workflowService.activateVersion(req.user!.id, req.params.id, req.body.version);
  res.json({ success: true, data: { workflow } });
});
