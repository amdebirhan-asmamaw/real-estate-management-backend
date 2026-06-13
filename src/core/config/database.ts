import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

let listenersBound = false;

const bindConnectionListeners = (): void => {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on("connected", () => {
    logger.info("✅ MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
};

/**
 * Establishes the MongoDB connection. Throws on failure so the caller
 * (server bootstrap) can decide how to handle it, rather than calling
 * process.exit deep inside a library function.
 */
export const connectDatabase = async (): Promise<void> => {
  mongoose.set("strictQuery", true);
  bindConnectionListeners();

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });
};

/** Cleanly closes the MongoDB connection (used on graceful shutdown). */
export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close();
  logger.info("MongoDB connection closed.");
};
