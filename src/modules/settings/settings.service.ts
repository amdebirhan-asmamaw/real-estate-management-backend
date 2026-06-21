import { SystemSettings, type ISystemSettings } from "./settings.model";

// Returns the singleton settings document, creating defaults if it doesn't exist.
export async function getSettings(): Promise<ISystemSettings> {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({});
  }
  return settings;
}

export type UpdateSettingsInput = Partial<
  Pick<
    ISystemSettings,
    | "platformName"
    | "platformEmail"
    | "supportEmail"
    | "commissionRate"
    | "commissionType"
    | "flatCommissionAmount"
    | "commissionCurrency"
    | "minTransactionAmount"
    | "maxTransactionAmount"
    | "escrowEnabled"
    | "autoApproveListings"
    | "maintenanceMode"
    | "allowGuestBrowsing"
  >
> & { updatedBy?: string };

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<ISystemSettings> {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create(input);
    return settings;
  }

  Object.assign(settings, input);
  await settings.save();
  return settings;
}
