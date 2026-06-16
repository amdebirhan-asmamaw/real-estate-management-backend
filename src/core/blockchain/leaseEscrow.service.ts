import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { LEASE_ESCROW_ABI } from "./leaseEscrow.abi";

export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL &&
      env.ESCROW_CONTRACT_ADDRESS &&
      env.ESCROW_TOKEN_ADDRESS &&
      env.MINTER_PRIVATE_KEY,
  );

let cached: { contract: Contract; owner: Wallet } | null = null;

const getContract = (): { contract: Contract; owner: Wallet } => {
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
    cached = { contract, owner };
  }
  return cached;
};

const toBytes32 = (hexHash: string): string =>
  hexHash.startsWith("0x") ? hexHash : `0x${hexHash}`;

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

export const activateEscrow = (id: string): Promise<EscrowTx> => call("activate", id);
export const cancelEscrow = (id: string): Promise<EscrowTx> => call("cancel", id);
export const releaseDeposit = (id: string): Promise<EscrowTx> => call("releaseDeposit", id);
export const refundDeposit = (id: string): Promise<EscrowTx> => call("refundDeposit", id);

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
};
