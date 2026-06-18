import mongoose from "mongoose";
import { JsonRpcProvider } from "ethers";
import { env } from "../config/env";
import * as title from "../blockchain/propertyTitle.service";
import * as leaseEscrow from "../blockchain/leaseEscrow.service";
import * as saleEscrow from "../blockchain/saleEscrow.service";

type ServiceStatus = "up" | "down" | "configured" | "not_configured";

interface ServiceCheck {
  status: ServiceStatus;
  detail?: string;
}

export interface ReadinessReport {
  status: "ready" | "not ready";
  services: Record<string, ServiceCheck>;
  timestamp: string;
}

const configured = (value: boolean, detail?: string): ServiceCheck => ({
  status: value ? "configured" : "not_configured",
  ...(detail && { detail }),
});

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);

const checkRpc = async (): Promise<ServiceCheck> => {
  if (!env.BLOCKCHAIN_RPC_URL) return { status: "not_configured" };
  try {
    const provider = new JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);
    const blockNumber = await withTimeout(provider.getBlockNumber(), 2_000);
    return { status: "up", detail: `block=${blockNumber}` };
  } catch (error) {
    return {
      status: "down",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

export const getReadiness = async (): Promise<ReadinessReport> => {
  const databaseUp = mongoose.connection.readyState === 1;
  const rpc = await checkRpc();
  const cloudinaryConfigured = Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
  const smtpConfigured = Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS,
  );

  const services: Record<string, ServiceCheck> = {
    database: { status: databaseUp ? "up" : "down" },
    smtp: configured(smtpConfigured),
    cloudinary: configured(cloudinaryConfigured),
    rpcProvider: rpc,
    titleContract: configured(title.isConfigured(), env.TITLE_CONTRACT_ADDRESS),
    leaseEscrow: configured(
      leaseEscrow.isConfigured(),
      env.ESCROW_CONTRACT_ADDRESS,
    ),
    saleEscrow: configured(
      saleEscrow.isConfigured(),
      env.SALE_ESCROW_CONTRACT_ADDRESS,
    ),
    geocoder: {
      status: "configured",
      detail:
        env.GEOCODER_PROVIDER === "nominatim" ? env.NOMINATIM_BASE_URL : "mock",
    },
  };

  const requiredReady =
    databaseUp && (!env.BLOCKCHAIN_RPC_URL || rpc.status === "up");

  return {
    status: requiredReady ? "ready" : "not ready",
    services,
    timestamp: new Date().toISOString(),
  };
};
