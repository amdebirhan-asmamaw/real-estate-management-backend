import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().port().default(5000),
  MONGODB_URI: Joi.string().uri().required().messages({
    "string.uri": "MONGODB_URI must be a valid MongoDB connection string",
    "any.required": "MONGODB_URI is required",
  }),
  JWT_SECRET: Joi.string().min(32).required().messages({
    "string.min": "JWT_SECRET must be at least 32 characters",
    "any.required": "JWT_SECRET is required",
  }),
  JWT_EXPIRES_IN: Joi.string().default("7d"),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref("JWT_SECRET"))
    .messages({
      "string.min": "JWT_REFRESH_SECRET must be at least 32 characters",
      "any.required": "JWT_REFRESH_SECRET is required",
      "any.invalid": "JWT_REFRESH_SECRET must differ from JWT_SECRET",
    }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("30d"),
  // Comma-separated list of allowed origins, or "*" to allow all.
  CORS_ORIGIN: Joi.string().default("*"),
  // Rate limiting (applied to /api).
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  // Express "trust proxy" setting. Use the number of proxies in front of the
  // app (e.g. 1 behind a single load balancer / reverse proxy), or 0 to disable.
  TRUST_PROXY: Joi.number().min(0).default(0),
})
  .unknown(true) // allow other process.env variables
  .required();

const { error, value } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  // Use console here: the logger depends on this module, so it may not be
  // safe to import during a bad-config bootstrap.
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment variables:\n",
    error.details.map((d) => `  - ${d.message}`).join("\n"),
  );
  process.exit(1);
}

interface Env {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  TRUST_PROXY: number;
}

const validated = value as Env;

export const env = {
  ...validated,
  isProduction: validated.NODE_ENV === "production",
  isDevelopment: validated.NODE_ENV === "development",
  isTest: validated.NODE_ENV === "test",
  // Parsed allowed origins. Empty array means "allow all".
  corsOrigins:
    validated.CORS_ORIGIN === "*"
      ? []
      : validated.CORS_ORIGIN.split(",")
          .map((o) => o.trim())
          .filter(Boolean),
};
