import { Router } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import notificationsRouter from "./notifications";
import templatesRouter from "./templates";
import logsRouter from "./logs";
import testSendRouter from "./test-send";

const router = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use("/notifications", notificationsRouter);
router.use("/templates", templatesRouter);
router.use("/logs", logsRouter);
router.use(testSendRouter);

export default router;
