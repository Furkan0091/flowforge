import { Router } from "express";
import { z } from "zod";
import * as controller from "../controllers/workflow.controller";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

const definitionSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  definition: definitionSchema.optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    definition: definitionSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const executeSchema = z.object({
  payload: z.unknown().optional(),
});

const activateVersionSchema = z.object({
  version: z.number().int().positive(),
});

router.use(requireAuth);

router.get("/", controller.listWorkflows);
router.post("/", validate(createSchema), controller.createWorkflow);

router.get("/:id", controller.getWorkflow);
router.put("/:id", validate(updateSchema), controller.updateWorkflow);
router.delete("/:id", controller.deleteWorkflow);

router.post("/:id/duplicate", controller.duplicateWorkflow);
router.post("/:id/enable", controller.enableWorkflow);
router.post("/:id/disable", controller.disableWorkflow);
router.post("/:id/execute", validate(executeSchema), controller.executeWorkflow);

router.get("/:id/versions", controller.listVersions);
router.post("/:id/versions/activate", validate(activateVersionSchema), controller.activateVersion);

export default router;
