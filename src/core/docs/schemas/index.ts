// Barrel that merges all feature-based schemas into a single object.

import { authSchemas } from "./auth.schemas";
import { listingSchemas } from "./listing.schemas";
import { inquirySchemas } from "./inquiry.schemas";
import { leaseSchemas } from "./lease.schemas";
import { kycSchemas } from "./kyc.schemas";
import { commonSchemas } from "./common.schemas";

export const allSchemas: Record<string, unknown> = {
  ...commonSchemas,
  ...authSchemas,
  ...listingSchemas,
  ...inquirySchemas,
  ...leaseSchemas,
  ...kycSchemas,
};
