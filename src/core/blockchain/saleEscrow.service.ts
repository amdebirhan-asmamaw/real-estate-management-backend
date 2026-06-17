import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { SALE_ESCROW_ABI } from "./saleEscrow.abi";

export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL &&
      env.SALE_ESCROW_CONTRACT_ADDRESS &&
      env.ESCROW_TOKEN_ADDRESS &&
      env.MINTER_PRIVATE_KEY,
  );

let cached: { contract: Contract; owner: Wallet } | null = null;

const getContract = (): { contract: Contract; owner: Wallet } => {
  if (!isConfigured()) {
    throw new AppError(
      "Sale escrow integration is not configured",
      StatusCodes.SERVICE_UNAVAILABLE,
    );
  }
  if (!cached) {
    const provider = new JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);
    const owner = new Wallet(env.MINTER_PRIVATE_KEY, provider);
    const contract = new Contract(
      env.SALE_ESCROW_CONTRACT_ADDRESS,
      SALE_ESCROW_ABI as unknown as string[],
      owner,
    );
    cached = { contract, owner };
  }
  return cached;
};

const toBytes32 = (hexHash: string): string =>
  hexHash.startsWith("0x") ? hexHash : `0x${hexHash}`;

export interface OpenSaleEscrowInput {
  saleId: string;
  buyer: string;
  seller: string;
  amount: bigint;
  termsHash: string;
}

export interface EscrowTx {
  txHash: string;
}

export interface OpenSaleEscrowResult extends EscrowTx {
  escrowId: string;
}

export const openAndFundEscrow = async (
  input: OpenSaleEscrowInput,
): Promise<OpenSaleEscrowResult> => {
  const { contract } = getContract();
  const tx = await contract.openAndFund(
    input.saleId,
    input.buyer,
    input.seller,
    env.ESCROW_TOKEN_ADDRESS,
    input.amount,
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
  method: "release" | "refund",
  escrowId: string,
): Promise<EscrowTx> => {
  const { contract } = getContract();
  const tx = await contract[method](escrowId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

export const releaseEscrow = (id: string): Promise<EscrowTx> => call("release", id);
export const refundEscrow = (id: string): Promise<EscrowTx> => call("refund", id);

// State enum: 0=None, 1=Funded, 2=Released, 3=Refunded
const STATE_LABELS = ["none", "funded", "released", "refunded"] as const;

export interface OnChainSaleEscrow {
  state: (typeof STATE_LABELS)[number];
  buyer: string;
  seller: string;
  amount: string;
  termsHash: string;
}

export const getEscrow = async (escrowId: string): Promise<OnChainSaleEscrow> => {
  const { contract } = getContract();
  const e = await contract.getEscrow(escrowId);
  return {
    state: STATE_LABELS[Number(e.state)] ?? "none",
    buyer: e.buyer as string,
    seller: e.seller as string,
    amount: e.amount.toString(),
    termsHash: (e.termsHash as string).replace(/^0x/, ""),
  };
};

export const _resetCache = (): void => {
  cached = null;
};
