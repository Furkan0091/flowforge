import { Router } from "express";
import authRoutes from "./auth.routes";
import workflowRoutes from "./workflow.routes";
import executionRoutes from "./execution.routes";
import webhookRoutes from "./webhook.routes";
import { dashboard } from "../controllers/dashboard.controller";
import { integrations } from "../controllers/integration.controller";
import { listTemplates, useTemplate } from "../controllers/template.controller";
import { nodeTypes } from "../controllers/nodeTypes.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Public
router.use("/auth", authRoutes);
router.use("/webhooks", webhookRoutes);

// Protected
router.use(requireAuth);

router.get("/workflows/node-types", nodeTypes);
router.use("/workflows", workflowRoutes);
router.use("/executions", executionRoutes);

router.get("/dashboard", dashboard);
router.get("/integrations", integrations);
router.get("/templates", listTemplates);
router.post("/templates/use", useTemplate);

export default router;
