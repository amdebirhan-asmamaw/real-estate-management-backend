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
  // Cloudinary (photo + private document storage). Optional so the app and
  // tests boot without credentials; the uploader fails fast at runtime if used
  // while unconfigured.
  CLOUDINARY_CLOUD_NAME: Joi.string().allow("").default(""),
  CLOUDINARY_API_KEY: Joi.string().allow("").default(""),
  CLOUDINARY_API_SECRET: Joi.string().allow("").default(""),
  // Max upload size per file in bytes (default 5MB).
  UPLOAD_MAX_BYTES: Joi.number().default(5 * 1024 * 1024),
  // Blockchain (Increment 2 — on-chain property titles). Optional so the app
  // and tests boot without a chain; the chain service fails fast if used while
  // unconfigured. MINTER_PRIVATE_KEY is the custodial platform wallet.
  BLOCKCHAIN_RPC_URL: Joi.string().allow("").default(""),
  TITLE_CONTRACT_ADDRESS: Joi.string().allow("").default(""),
  MINTER_PRIVATE_KEY: Joi.string().allow("").default(""),
  // Email delivery. Optional outside production; password-reset requests log a
  // development link when SMTP is not configured.
  APP_BASE_URL: Joi.string().uri().default("http://localhost:3000"),
  MAIL_FROM: Joi.string().default("Swafri <no-reply@swafri.local>"),
  SMTP_HOST: Joi.string().allow("").default(""),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow("").default(""),
  SMTP_PASS: Joi.string().allow("").default(""),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().integer().min(5).max(120).default(30),
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
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  UPLOAD_MAX_BYTES: number;
  BLOCKCHAIN_RPC_URL: string;
  TITLE_CONTRACT_ADDRESS: string;
  MINTER_PRIVATE_KEY: string;
  APP_BASE_URL: string;
  MAIL_FROM: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  PASSWORD_RESET_EXPIRES_MINUTES: number;
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
