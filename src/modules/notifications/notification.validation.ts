import Joi from "joi";

export const notificationQuerySchema = Joi.object({
  unreadOnly: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type NotificationQueryInput = {
  unreadOnly: boolean;
  page: number;
  limit: number;
};
