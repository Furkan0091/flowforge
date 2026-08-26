import { Request, Response } from "express";
import { getIntegrationStatus } from "../services/integration.service";
import { asyncHandler } from "../utils/asyncHandler";

export const integrations = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getIntegrationStatus();
  res.json({ success: true, data });
});
