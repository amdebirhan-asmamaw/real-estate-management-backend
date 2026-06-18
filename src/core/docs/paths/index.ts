// Barrel that merges all feature-based path definitions into a single object.
// The "/listings" key needs special handling because discovery.paths (GET) and
// listing.paths (POST) both define it. We deep-merge that single key.

import { authPaths } from "./auth.paths";
import { kycPaths } from "./kyc.paths";
import { discoveryPaths } from "./discovery.paths";
import { listingPaths } from "./listing.paths";
import { mediaPaths } from "./media.paths";
import { titlePaths } from "./title.paths";
import { favoritePaths } from "./favorite.paths";
import { inquiryPaths } from "./inquiry.paths";
import { offerPaths } from "./offer.paths";
import { leasePaths } from "./lease.paths";
import { notificationPaths } from "./notification.paths";
import { savedSearchPaths } from "./saved-search.paths";
import { rentalApplicationPaths } from "./rental-application.paths";
import { purchaseTransactionPaths } from "./purchase-transaction.paths";
import { compliancePaths } from "./compliance.paths";
import { chainTransactionPaths } from "./chain-transaction.paths";
import { adminPaths } from "./admin.paths";
import { rentalYieldPaths } from "./rental-yield.paths";

// Deep-merge the "/listings" key from discovery (GET) and listings (POST).
const listingsEntry = {
  ...(discoveryPaths["/listings"] as Record<string, unknown>),
  ...(listingPaths["/listings"] as Record<string, unknown>),
};

// Remove "/listings" from both sources to avoid overwrites, then assign the merged entry.
const { "/listings": _d, ...restDiscovery } = discoveryPaths;
const { "/listings": _l, ...restListings } = listingPaths;

export const allPaths: Record<string, unknown> = {
  ...authPaths,
  ...kycPaths,
  "/listings": listingsEntry,
  ...restDiscovery,
  ...restListings,
  ...mediaPaths,
  ...titlePaths,
  ...favoritePaths,
  ...inquiryPaths,
  ...offerPaths,
  ...leasePaths,
  ...notificationPaths,
  ...savedSearchPaths,
  ...rentalApplicationPaths,
  ...purchaseTransactionPaths,
  ...compliancePaths,
  ...chainTransactionPaths,
  ...adminPaths,
  ...rentalYieldPaths,
};
