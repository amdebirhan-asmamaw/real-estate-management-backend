import { StatusCodes } from "http-status-codes";
import { Notification, INotification, NotificationType } from "./notification.model";
import { AppError } from "../../core/utils/AppError";
import { logger } from "../../core/utils/logger";

interface NotifyInput {
  recipient: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export const notify = async (input: NotifyInput): Promise<void> => {
  try {
    await Notification.create(input);
  } catch (error) {
    logger.error("Failed to write notification:", error);
  }
};

export interface NotificationQuery {
  unreadOnly?: boolean;
  page: number;
  limit: number;
}

export const listMine = async (
  userId: string,
  q: NotificationQuery,
): Promise<{
  items: INotification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}> => {
  const filter: Record<string, unknown> = { recipient: userId };
  if (q.unreadOnly) filter.readAt = { $exists: false };
  const unreadFilter = { recipient: userId, readAt: { $exists: false } };
  const skip = (q.page - 1) * q.limit;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments(unreadFilter),
  ]);

  return { items, total, unread, page: q.page, limit: q.limit };
};

export const markRead = async (
  userId: string,
  notificationId: string,
): Promise<INotification> => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });
  if (!notification) {
    throw new AppError("Notification not found", StatusCodes.NOT_FOUND);
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
};

export const markAllRead = async (userId: string): Promise<void> => {
  await Notification.updateMany(
    { recipient: userId, readAt: { $exists: false } },
    { readAt: new Date() },
  );
};
