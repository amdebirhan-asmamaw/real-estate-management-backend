// Health check paths (defined directly in app.ts, not under /api/v1).
// These run outside the API prefix at the root level.

export const healthPaths: Record<string, unknown> = {};

// NOTE: Health endpoints are mounted at / (outside /api/v1).
// They are documented here for completeness but the OpenAPI spec
// uses servers[0].url = /api/v1, so these are not reachable via
// Swagger "Try it out" — they live at GET /health and GET /health/ready.
//
// If you want them in Swagger, set a separate server entry at /.
