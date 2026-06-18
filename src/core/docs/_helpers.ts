// Shared OpenAPI doc helpers used across all feature-based path and schema files.

/** Bearer-auth security requirement. */
export const bearer = [{ bearerAuth: [] }];

/** Standard `{ success, message, data? }` envelope wrapper. */
export const envelope = (dataRef?: string) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    ...(dataRef ? { data: { $ref: dataRef } } : { data: {} }),
  },
});

/** Shorthand for a JSON request body. */
export const body = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { "application/json": { schema } },
});

/** Shorthand for a simple `200` response. */
export const ok = (description: string) => ({ "200": { description } });

/** Common `id` path parameter. */
export const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

/** Common `page` query parameter. */
export const page = {
  name: "page",
  in: "query",
  schema: { type: "integer", default: 1, minimum: 1 },
};

/** Common `limit` query parameter. */
export const limit = {
  name: "limit",
  in: "query",
  schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
};
