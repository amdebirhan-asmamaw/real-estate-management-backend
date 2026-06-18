import { JsonRpcProvider, Wallet, Contract, parseUnits } from "ethers";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { LEASE_ESCROW_ABI } from "./leaseEscrow.abi";

export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL &&
    env.ESCROW_CONTRACT_ADDRESS &&
    env.ESCROW_TOKEN_ADDRESS &&
    env.MINTER_PRIVATE_KEY,
  );

interface ContractCache {
  contract: Contract;
  owner: Wallet;
  provider: JsonRpcProvider;
}

let cached: ContractCache | null = null;
/** Cached token decimals — null means not yet fetched. */
let cachedDecimals: number | null = null;
/** Cached network chainId — null means not yet fetched. */
let cachedChainId: number | null = null;

const getContract = (): ContractCache => {
  if (!isConfigured()) {
    throw new AppError(
      "Lease escrow integration is not configured",
      StatusCodes.SERVICE_UNAVAILABLE,
    );
  }
  if (!cached) {
    const provider = new JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);
    const owner = new Wallet(env.MINTER_PRIVATE_KEY, provider);
    const contract = new Contract(
      env.ESCROW_CONTRACT_ADDRESS,
      LEASE_ESCROW_ABI as unknown as string[],
      owner,
    );
    cached = { contract, owner, provider };
  }
  return cached;
};

const toBytes32 = (hexHash: string): string =>
  hexHash.startsWith("0x") ? hexHash : `0x${hexHash}`;

/**
 * Read the configured ERC-20 token's decimals once, then cache the result.
 *
 * Falls back to 18 (the ERC-20 standard default) with a warning if the read
 * fails — this keeps the service alive when a provider is flaky at startup
 * while still logging the problem clearly.
 *
 * Design choice: we read on first use rather than asserting at startup, because
 * the contract is optional and may not be configured in all environments (tests,
 * CI). The lazy read is safe: decimals never change for a given token contract.
 */
export const getTokenDecimals = async (): Promise<number> => {
  if (cachedDecimals !== null) return cachedDecimals;

  try {
    const { provider } = getContract();
    // Read decimals directly from the token contract (standard ERC-20).
    const tokenContract = new Contract(
      env.ESCROW_TOKEN_ADDRESS,
      ["function decimals() view returns (uint8)"],
      provider,
    );
    const decimals: bigint = await tokenContract.decimals();
    cachedDecimals = Number(decimals);
    logger.info(`leaseEscrow: token decimals resolved to ${cachedDecimals}`);
    return cachedDecimals;
  } catch (err) {
    const fallback = 18;
    logger.warn(
      `leaseEscrow: failed to read token decimals, falling back to ${fallback}. Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    cachedDecimals = fallback;
    return fallback;
  }
};

/**
 * Scale a human-readable amount to token base units using the actual decimals
 * of the configured token, rather than assuming 18.
 */
export const toBaseUnits = async (amount: number): Promise<bigint> => {
  const decimals = await getTokenDecimals();
  return parseUnits(amount.toString(), decimals);
};

/**
 * Guard against accidental mainnet escrow operations.
 *
 * Reads the provider's chainId once and caches it. If the connected network is
 * Ethereum mainnet (chainId 1) and ALLOW_MAINNET_ESCROW is not true, throw an
 * AppError. This prevents real-money fund moves when the environment is
 * misconfigured (e.g. a staging deploy accidentally pointed at mainnet).
 */
const assertNotMainnet = async (): Promise<void> => {
  if (cachedChainId === null) {
    const { provider } = getContract();
    const network = await provider.getNetwork();
    cachedChainId = Number(network.chainId);
  }

  if (cachedChainId === 1 && !env.ALLOW_MAINNET_ESCROW) {
    throw new AppError(
      "Lease escrow operations on Ethereum mainnet are disabled. " +
        "Set ALLOW_MAINNET_ESCROW=true to enable (use with extreme caution).",
      StatusCodes.FORBIDDEN,
    );
  }
};

export interface OpenEscrowInput {
  leaseId: string;
  landlord: string;
  tenant: string;
  rentAmount: bigint;
  depositAmount: bigint;
  termsHash: string;
}

export interface EscrowTx {
  txHash: string;
}

export interface OpenEscrowResult extends EscrowTx {
  escrowId: string;
}

export const openAndFundEscrow = async (
  input: OpenEscrowInput,
): Promise<OpenEscrowResult> => {
  await assertNotMainnet();
  const { contract } = getContract();
  const tx = await contract.openAndFund(
    input.leaseId,
    input.landlord,
    input.tenant,
    env.ESCROW_TOKEN_ADDRESS,
    input.rentAmount,
    input.depositAmount,
    toBytes32(input.termsHash),
  );
  const receipt = await tx.wait();

  let escrowId: string | undefined;
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "EscrowFunded") {
        escrowId = parsed.args.escrowId.toString();
        break;
      }
    } catch {
      // not from this contract
    }
  }
  if (!escrowId) {
    throw new AppError(
      "Escrow funded but no EscrowFunded event was found",
      StatusCodes.BAD_GATEWAY,
    );
  }
  return { escrowId, txHash: receipt.hash };
};

const call = async (
  method: "activate" | "cancel" | "releaseDeposit" | "refundDeposit",
  escrowId: string,
): Promise<EscrowTx> => {
  const { contract } = getContract();
  const tx = await contract[method](escrowId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

export const activateEscrow = (id: string): Promise<EscrowTx> =>
  call("activate", id);
export const cancelEscrow = (id: string): Promise<EscrowTx> =>
  call("cancel", id);
export const releaseDeposit = (id: string): Promise<EscrowTx> =>
  call("releaseDeposit", id);
export const refundDeposit = (id: string): Promise<EscrowTx> =>
  call("refundDeposit", id);

const STATE_LABELS = ["none", "funded", "active", "closed"] as const;

export interface OnChainEscrow {
  state: (typeof STATE_LABELS)[number];
  landlord: string;
  tenant: string;
  rentAmount: string;
  depositAmount: string;
  termsHash: string;
}

export const getEscrow = async (escrowId: string): Promise<OnChainEscrow> => {
  const { contract } = getContract();
  const e = await contract.getEscrow(escrowId);
  return {
    state: STATE_LABELS[Number(e.state)] ?? "none",
    landlord: e.landlord as string,
    tenant: e.tenant as string,
    rentAmount: e.rentAmount.toString(),
    depositAmount: e.depositAmount.toString(),
    termsHash: (e.termsHash as string).replace(/^0x/, ""),
  };
};

export const _resetCache = (): void => {
  cached = null;
  cachedDecimals = null;
  cachedChainId = null;
};
