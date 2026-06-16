import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { listingRouter } from "./modules/listings/listing.routes";
import { adminRouter } from "./modules/listings/admin.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { favoriteRouter } from "./modules/favorites/favorite.routes";
import { inquiryRouter } from "./modules/inquiries/inquiry.routes";
import { kycRouter } from "./modules/kyc/kyc.routes";
import { userAdminRouter } from "./modules/kyc/kyc.admin.routes";
import { leaseRouter } from "./modules/leases/lease.routes";
import { chainTransactionRouter } from "./modules/chainTransactions/chainTransaction.routes";
import { notificationRouter } from "./modules/notifications/notification.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/listings", listingRouter);
router.use("/admin", adminRouter);
router.use("/admin", userAdminRouter);
router.use("/audit-logs", auditRouter);
router.use("/favorites", favoriteRouter);
router.use("/inquiries", inquiryRouter);
router.use("/kyc", kycRouter);
router.use("/leases", leaseRouter);
router.use("/chain-transactions", chainTransactionRouter);
router.use("/notifications", notificationRouter);

// Register new module routers here:

export default router;
