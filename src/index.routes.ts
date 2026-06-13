import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";

const router = Router();

router.use("/auth", authRouter);

// Register new module routers here:

export default router;
