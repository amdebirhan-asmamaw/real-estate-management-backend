/** Well-known permission keys used across admin routes. */
export const PERMISSION_KEYS = {
  USERS_LIST: "users.list",
  USERS_SUSPEND: "users.suspend",
  USERS_REACTIVATE: "users.reactivate",
  USERS_BLOCK: "users.block",
  USERS_WALLET_REVOKE: "users.wallet_revoke",
  ADMINS_MANAGE: "admins.manage",
  PERMISSIONS_MANAGE: "permissions.manage",
  KYC_REVIEW: "kyc.review",
  LISTINGS_REVIEW: "listings.review",
  COMPLIANCE_MANAGE: "compliance.manage",
} as const;

export type KnownPermissionKey =
  (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export const DEFAULT_PERMISSIONS: Array<{
  key: KnownPermissionKey;
  name: string;
  description: string;
  isSystem: boolean;
}> = [
  {
    key: PERMISSION_KEYS.USERS_LIST,
    name: "List users",
    description: "View the platform user directory",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.USERS_SUSPEND,
    name: "Suspend users",
    description: "Suspend active user accounts",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.USERS_REACTIVATE,
    name: "Reactivate users",
    description: "Reactivate suspended user accounts",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.USERS_BLOCK,
    name: "Block users",
    description: "Permanently block user accounts",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.USERS_WALLET_REVOKE,
    name: "Revoke user wallets",
    description: "Revoke linked wallets from user accounts",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.KYC_REVIEW,
    name: "Review KYC",
    description: "Review and approve or reject KYC submissions",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.LISTINGS_REVIEW,
    name: "Review listings",
    description: "Review, approve, and publish property listings",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.COMPLIANCE_MANAGE,
    name: "Manage compliance",
    description: "Manage compliance cases and review queues",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.ADMINS_MANAGE,
    name: "Manage admins",
    description: "Create and manage admin accounts (non super-admin)",
    isSystem: true,
  },
  {
    key: PERMISSION_KEYS.PERMISSIONS_MANAGE,
    name: "Manage permissions",
    description: "Create permissions and assign them to admins",
    isSystem: true,
  },
];
