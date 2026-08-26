import { Request, Response } from "express";
import { getNodeSchemas } from "../nodes/registry";
import { asyncHandler } from "../utils/asyncHandler";

export const nodeTypes = asyncHandler(async (_req: Request, res: Response) => {
  const schemas = getNodeSchemas();
  const categories = ["trigger", "logic", "action", "integration", "data"] as const;
  res.json({
    success: true,
    data: {
      categories: categories.map((c) => ({
        id: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
        nodes: schemas.filter((s) => s.category === c),
      })),
    },
  });
});
