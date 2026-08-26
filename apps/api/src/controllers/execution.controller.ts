import { Request, Response } from "express";
import * as executionService from "../services/execution.service";
import { asyncHandler } from "../utils/asyncHandler";

export const listExecutions = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10) || 25, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const data = await executionService.listExecutions({
    userId: req.user!.id,
    workflowId: typeof req.query.workflowId === "string" ? req.query.workflowId : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    limit,
    offset,
  });
  res.json({ success: true, data });
});

export const getExecution = asyncHandler(async (req: Request, res: Response) => {
  const execution = await executionService.getExecution(req.user!.id, req.params.id);
  res.json({ success: true, data: { execution } });
});

export const getExecutionLogs = asyncHandler(async (req: Request, res: Response) => {
  const logs = await executionService.getExecutionLogs(req.user!.id, req.params.id);
  res.json({ success: true, data: { logs } });
});

export const cancelExecution = asyncHandler(async (req: Request, res: Response) => {
  const execution = await executionService.cancelExecution(req.user!.id, req.params.id);
  res.json({ success: true, data: { execution } });
});

export const rerunExecution = asyncHandler(async (req: Request, res: Response) => {
  const execution = await executionService.rerunExecution(req.user!.id, req.params.id);
  res.status(202).json({
    success: true,
    data: { executionId: execution.executionId, status: execution.status },
  });
});
