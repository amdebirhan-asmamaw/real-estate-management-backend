import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { listingRouter } from "./modules/listings/listing.routes";
import { adminRouter } from "./modules/listings/admin.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { favoriteRouter } from "./modules/favorites/favorite.routes";
import { inquiryRouter } from "./modules/inquiries/inquiry.routes";
import { kycRouter } from "./modules/kyc/kyc.routes";
import { userAdminRouter } from "./modules/kyc/kyc.admin.routes";
import { adminUserRouter } from "./modules/admin/admin.routes";
import { leaseRouter } from "./modules/leases/lease.routes";
import { chainTransactionRouter } from "./modules/chainTransactions/chainTransaction.routes";
import { notificationRouter } from "./modules/notifications/notification.routes";
import { savedSearchRouter } from "./modules/savedSearches/savedSearch.routes";
import { offerRouter } from "./modules/offers/offer.routes";
import { complianceRouter } from "./modules/compliance/compliance.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/listings", listingRouter);
router.use("/admin", adminRouter);
router.use("/admin", userAdminRouter);
router.use("/admin", adminUserRouter);
router.use("/audit-logs", auditRouter);
router.use("/favorites", favoriteRouter);
router.use("/inquiries", inquiryRouter);
router.use("/kyc", kycRouter);
router.use("/leases", leaseRouter);
router.use("/chain-transactions", chainTransactionRouter);
router.use("/notifications", notificationRouter);
router.use("/saved-searches", savedSearchRouter);
router.use("/offers", offerRouter);
router.use("/compliance", complianceRouter);

// Register new module routers here:

export default router;
