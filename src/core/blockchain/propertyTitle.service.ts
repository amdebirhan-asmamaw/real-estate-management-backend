import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { PROPERTY_TITLE_ABI } from "./propertyTitle.abi";

export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL &&
    env.TITLE_CONTRACT_ADDRESS &&
    env.MINTER_PRIVATE_KEY,
  );

let cached: { contract: Contract; minter: Wallet } | null = null;

const getContract = (): { contract: Contract; minter: Wallet } => {
  if (!isConfigured()) {
    throw new AppError(
      "Blockchain integration is not configured",
      StatusCodes.SERVICE_UNAVAILABLE,
    );
  }
  if (!cached) {
    const provider = new JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);
    const minter = new Wallet(env.MINTER_PRIVATE_KEY, provider);
    const contract = new Contract(
      env.TITLE_CONTRACT_ADDRESS,
      PROPERTY_TITLE_ABI as unknown as string[],
      minter,
    );
    cached = { contract, minter };
  }
  return cached;
};

// sha-256 hex (no 0x) → 32-byte hex string the contract expects.
const toBytes32 = (hexHash: string): string => `0x${hexHash}`;

export interface MintInput {
  listingId: string;
  documentHash: string; // sha-256 hex digest of the approved title document
  to?: string; // defaults to the custodial minter wallet
}

export interface MintResult {
  tokenId: string;
  txHash: string;
  contractAddress: string;
  owner: string;
}

/** Mints a digital title NFT anchoring the listing id + document hash. */
export const mintTitle = async (input: MintInput): Promise<MintResult> => {
  const { contract, minter } = getContract();
  const recipient = input.to ?? minter.address;

  const tx = await contract.mintTitle(
    recipient,
    input.listingId,
    toBytes32(input.documentHash),
  );
  const receipt = await tx.wait();

  let tokenId: string | undefined;
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "TitleMinted") {
        tokenId = parsed.args.tokenId.toString();
        break;
      }
    } catch {
      // Not a log from this contract — skip.
    }
  }
  if (!tokenId) {
    throw new AppError(
      "Mint succeeded but no TitleMinted event was found",
      StatusCodes.BAD_GATEWAY,
    );
  }

  return {
    tokenId,
    txHash: receipt.hash,
    contractAddress: env.TITLE_CONTRACT_ADDRESS,
    owner: recipient,
  };
};

export interface OnChainTitle {
  owner: string;
  documentHash: string; // hex, no 0x prefix
  status: "none" | "active" | "disputed" | "revoked";
}

const TITLE_STATUS_LABELS = ["none", "active", "disputed", "revoked"] as const;

/** Reads the on-chain owner and anchored document hash for a token. */
export const getTitle = async (tokenId: string): Promise<OnChainTitle> => {
  const { contract } = getContract();
  const [owner, documentHash, status] = await Promise.all([
    contract.ownerOf(tokenId),
    contract.documentHashOf(tokenId),
    contract.titleStatusOf(tokenId),
  ]);
  return {
    owner: owner as string,
    documentHash: (documentHash as string).replace(/^0x/, ""),
    status: TITLE_STATUS_LABELS[Number(status)] ?? "none",
  };
};

/** Marks an on-chain title as disputed (Active → Disputed). */
export const disputeTitle = async (
  tokenId: string,
  reason: string,
): Promise<{ txHash: string }> => {
  const { contract } = getContract();
  const tx = await contract.markDisputed(tokenId, reason);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

/** Clears a dispute on an on-chain title (Disputed → Active). */
export const clearTitleDispute = async (
  tokenId: string,
  reason: string,
): Promise<{ txHash: string }> => {
  const { contract } = getContract();
  const tx = await contract.clearDispute(tokenId, reason);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

/** Permanently revokes an on-chain title (Active|Disputed → Revoked). */
export const revokeOnChainTitle = async (
  tokenId: string,
  reason: string,
): Promise<{ txHash: string }> => {
  const { contract } = getContract();
  const tx = await contract.revokeTitle(tokenId, reason);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

/**
 * Transfers a title NFT from the custodial minter wallet to the buyer's
 * wallet address.  The custodial signer is the current owner of all minted
 * titles, so we call transferFrom(minter.address, toWallet, tokenId).
 */
export const transferTitle = async (
  tokenId: string,
  toWallet: string,
): Promise<{ txHash: string }> => {
  const { contract, minter } = getContract();
  const tx = await contract.transferFrom(minter.address, toWallet, tokenId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

// Test seam: reset the memoized contract between tests if needed.
export const _resetCache = (): void => {
  cached = null;
};
