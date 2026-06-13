import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { listingRouter } from "./modules/listings/listing.routes";
import { adminRouter } from "./modules/listings/admin.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { favoriteRouter } from "./modules/favorites/favorite.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/listings", listingRouter);
router.use("/admin", adminRouter);
router.use("/audit-logs", auditRouter);
router.use("/favorites", favoriteRouter);

// Register new module routers here:

export default router;
