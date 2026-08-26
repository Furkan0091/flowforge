import { Router } from "express";
import * as controller from "../controllers/execution.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", controller.listExecutions);
router.get("/:id", controller.getExecution);
router.get("/:id/logs", controller.getExecutionLogs);
router.post("/:id/cancel", controller.cancelExecution);
router.post("/:id/rerun", controller.rerunExecution);

export default router;
