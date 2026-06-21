import Joi from "joi";

export const updateSettingsSchema = Joi.object({
  platformName: Joi.string().min(1).max(100),
  platformEmail: Joi.string().email(),
  supportEmail: Joi.string().email(),

  commissionRate: Joi.number().min(0).max(100),
  commissionType: Joi.string().valid("percentage", "flat"),
  flatCommissionAmount: Joi.number().min(0),
  commissionCurrency: Joi.string().length(3).uppercase(),

  minTransactionAmount: Joi.number().min(0),
  maxTransactionAmount: Joi.number().min(0),

  escrowEnabled: Joi.boolean(),
  autoApproveListings: Joi.boolean(),
  maintenanceMode: Joi.boolean(),
  allowGuestBrowsing: Joi.boolean(),
}).min(1);
