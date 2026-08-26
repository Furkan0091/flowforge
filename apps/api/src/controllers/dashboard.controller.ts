import { Request, Response } from "express";
import { getDashboard } from "../services/dashboard.service";
import { asyncHandler } from "../utils/asyncHandler";

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await getDashboard(req.user!.id);
  res.json({ success: true, data });
});
