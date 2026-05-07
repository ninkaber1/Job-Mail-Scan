import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import applicationsRouter from "./applications";
import googleAuthRouter from "./google-auth";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(googleAuthRouter);
router.use(emailRouter);
router.use(applicationsRouter);
router.use(activityRouter);

export default router;
