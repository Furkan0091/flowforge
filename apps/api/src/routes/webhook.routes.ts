import { Router } from "express";
import * as controller from "../controllers/webhook.controller";
import { webhookLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/:workflowId", webhookLimiter, controller.receiveWebhook);
// GET etc. are rejected with a clear error by the controller when the webhook
// is configured for POST; still accept other methods for flexibility.
router.all("/:workflowId", controller.receiveWebhook);

export default router;
