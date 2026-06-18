// Hand-curated OpenAPI 3.0 description of the API. Served as interactive docs at
// GET /api/v1/docs and as raw JSON at GET /api/v1/docs.json. Keep the individual
// feature-based files (schemas/*.schemas.ts, paths/*.paths.ts) in sync with the
// route definitions; they are the contract the frontend builds against.

import { env } from "../config/env";
import { allSchemas } from "./schemas";
import { allPaths } from "./paths";

export const openapiSpec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "Real Estate Marketplace API",
    version: "1.0.0",
    description:
      "Backend for a verified, decentralized real-estate marketplace. " +
      "All responses use the envelope `{ success, message, data? }` (errors: " +
      "`{ success:false, message, errors? }`). Authenticate with a Bearer access token.",
  },
  servers: [
    { url: "/api/v1", description: "Current server (v1)" },
    {
      url: `http://localhost:${env.PORT}/api/v1`,
      description: "Local dev",
    },
  ],
  tags: [
    {
      name: "Auth",
      description: "Registration, login, tokens, profile, wallet",
    },
    { name: "KYC", description: "Identity verification (self-service)" },
    { name: "Listings", description: "Property listings & review workflow" },
    { name: "Discovery", description: "Public geospatial search" },
    {
      name: "Media",
      description: "Photos (public) & ownership documents (private)",
    },
    {
      name: "Titles",
      description: "On-chain property titles & dispute management",
    },
    { name: "Favorites", description: "Saved listings" },
    { name: "Inquiries", description: "Tenant → owner inquiries" },
    {
      name: "Offers",
      description: "Purchase offers from tenants to property owners",
    },
    { name: "Notifications", description: "User notifications" },
    {
      name: "Saved Searches",
      description: "Persisted discovery queries with optional alerts",
    },
    { name: "Leases", description: "Lease agreements & on-chain escrow" },
    {
      name: "Rental Applications",
      description: "Tenant rental application workflow",
    },
    {
      name: "Purchase Transactions",
      description: "Property purchase transaction lifecycle",
    },
    {
      name: "Compliance",
      description: "Compliance cases, screenings & broker licenses",
    },
    {
      name: "Chain Transactions",
      description: "Blockchain transaction audit trail",
    },
    {
      name: "Rental Yield",
      description: "Maintenance records & rental yield analytics",
    },
    { name: "Admin", description: "Admin-only review & user management" },
    { name: "Health", description: "Liveness / readiness" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: allSchemas,
    responses: {
      Error: {
        description: "Error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
  security: [],
  paths: allPaths,
};
