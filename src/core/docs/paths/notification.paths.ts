// Notification paths.

import { bearer, ok, idParam, page, limit } from "../_helpers";

export const notificationPaths: Record<string, unknown> = {
  "/notifications": {
    get: {
      tags: ["Notifications"],
      summary: "List caller's notifications",
      security: bearer,
      parameters: [
        {
          name: "unreadOnly",
          in: "query",
          schema: { type: "boolean", default: false },
        },
        page,
        limit,
      ],
      responses: ok("Notifications"),
    },
  },
  "/notifications/read-all": {
    post: {
      tags: ["Notifications"],
      summary: "Mark all as read",
      security: bearer,
      responses: ok("Done"),
    },
  },
  "/notifications/{id}/read": {
    post: {
      tags: ["Notifications"],
      summary: "Mark one as read",
      security: bearer,
      parameters: [idParam],
      responses: ok("Done"),
    },
  },
};
