// Runs before any application module is imported, so env validation passes.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/test";
process.env.JWT_SECRET = "test_jwt_secret_at_least_32_characters_long_xxxx";
process.env.JWT_REFRESH_SECRET =
  "test_refresh_secret_at_least_32_characters_long_xx";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.CORS_ORIGIN = "*";
