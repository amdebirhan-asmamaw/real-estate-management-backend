// Notification paths.
// Aligned to: notification.routes.ts, notification.service.ts, notification.model.ts.

import { bearer, idParam, page, limit } from "../_helpers";

const notificationSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    recipient: { type: "string" },
    type: {
      type: "string",
      enum: [
        "auth.registration",
        "auth.password_changed",
        "account.suspended",
        "account.reactivated",
        "account.blocked",
        "kyc.approved",
        "kyc.rejected",
        "listing.review_update",
        "listing.published",
        "listing.rejected",
        "listing.title_minted",
        "inquiry.received",
        "inquiry.responded",
        "offer.received",
        "offer.responded",
        "lease.status_update",
        "compliance.case_update",
        "compliance.case_opened",
        "admin.review_requested",
        "purchase.status_update",
        "rental_application.received",
        "rental_application.status_update",
        "saved_search.match",
      ],
    },
    title: { type: "string", maxLength: 160 },
    message: { type: "string", maxLength: 1000 },
    metadata: { type: "object", additionalProperties: true },
    readAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const notificationPaths: Record<string, unknown> = {
  "/notifications": {
    get: {
      tags: ["Notifications"],
      summary: "List caller's notifications",
      description:
        "Paginated notifications sorted by createdAt descending. " +
        "Includes an `unread` count across all pages.",
      security: bearer,
      parameters: [
        {
          name: "unreadOnly",
          in: "query",
          schema: { type: "boolean", default: false },
          description: "When true, only unread notifications are returned",
        },
        page,
        limit,
      ],
      responses: {
        "200": {
          description: "Paginated notifications",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Notifications" },
                  data: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: notificationSchema },
                      total: { type: "integer" },
                      unread: {
                        type: "integer",
                        description: "Total unread count",
                      },
                      page: { type: "integer" },
                      limit: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/notifications/read-all": {
    post: {
      tags: ["Notifications"],
      summary: "Mark all notifications as read",
      description: "Sets readAt on all unread notifications for the caller.",
      security: bearer,
      responses: {
        "200": {
          description: "All notifications marked read",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "All notifications read",
                  },
                  data: { type: "null" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/notifications/{id}/read": {
    post: {
      tags: ["Notifications"],
      summary: "Mark one notification as read",
      description:
        "Idempotent — marking an already-read notification is a no-op.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Notification marked read",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Notification read" },
                  data: notificationSchema,
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Notification not found or not owned by caller",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
