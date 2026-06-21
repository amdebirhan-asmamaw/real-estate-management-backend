import { JsonRpcProvider, Wallet, Contract, parseUnits } from "ethers";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { SALE_ESCROW_ABI } from "./saleEscrow.abi";

export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL &&
    env.SALE_ESCROW_CONTRACT_ADDRESS &&
    env.ESCROW_TOKEN_ADDRESS &&
    env.MINTER_PRIVATE_KEY,
  );

interface ContractCache {
  contract: Contract;
  owner: Wallet;
  provider: JsonRpcProvider;
}

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

let cached: ContractCache | null = null;
/** Cached token decimals — null means not yet fetched. */
let cachedDecimals: number | null = null;
/** Cached network chainId — null means not yet fetched. */
let cachedChainId: number | null = null;

const getContract = (): ContractCache => {
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
    const tokenContract = new Contract(
      env.ESCROW_TOKEN_ADDRESS,
      ["function decimals() view returns (uint8)"],
      provider,
    );
    const decimals: bigint = await tokenContract.decimals();
    cachedDecimals = Number(decimals);
    logger.info(`saleEscrow: token decimals resolved to ${cachedDecimals}`);
    return cachedDecimals;
  } catch (err) {
    const fallback = 18;
    logger.warn(
      `saleEscrow: failed to read token decimals, falling back to ${fallback}. Error: ${err instanceof Error ? err.message : String(err)}`,
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

const formatUnitsForMessage = async (amount: bigint): Promise<string> => {
  const decimals = await getTokenDecimals();
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
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
      "Sale escrow operations on Ethereum mainnet are disabled. " +
        "Set ALLOW_MAINNET_ESCROW=true to enable (use with extreme caution).",
      StatusCodes.FORBIDDEN,
    );
  }
};

const assertEscrowContractReady = async (): Promise<void> => {
  const { contract, owner } = getContract();
  const [paused, allowed, operatorRole] = await Promise.all([
    contract.paused() as Promise<boolean>,
    contract.allowedTokens(env.ESCROW_TOKEN_ADDRESS) as Promise<boolean>,
    contract.SALE_ESCROW_OPERATOR_ROLE() as Promise<string>,
  ]);
  const isOperator = (await contract.hasRole(
    operatorRole,
    owner.address,
  )) as boolean;

  if (paused) {
    throw new AppError(
      "Sale escrow contract is paused. Unpause it before funding purchase escrow.",
      StatusCodes.CONFLICT,
    );
  }

  if (!allowed) {
    throw new AppError(
      `Escrow token ${env.ESCROW_TOKEN_ADDRESS} is not allowlisted on SaleEscrow ${env.SALE_ESCROW_CONTRACT_ADDRESS}. ` +
        "Call setTokenAllowed(token, true) before funding purchase escrow.",
      StatusCodes.CONFLICT,
    );
  }

  if (!isOperator) {
    throw new AppError(
      `Configured escrow signer ${owner.address} does not have SALE_ESCROW_OPERATOR_ROLE on SaleEscrow ${env.SALE_ESCROW_CONTRACT_ADDRESS}. ` +
        "Grant it with setSaleEscrowOperator(signer, true).",
      StatusCodes.FORBIDDEN,
    );
  }
};

const ensureTokenFundingApproval = async (amount: bigint): Promise<void> => {
  const { owner } = getContract();
  const token = new Contract(
    env.ESCROW_TOKEN_ADDRESS,
    ERC20_ABI as unknown as string[],
    owner,
  );

  const [balance, allowance] = (await Promise.all([
    token.balanceOf(owner.address),
    token.allowance(owner.address, env.SALE_ESCROW_CONTRACT_ADDRESS),
  ])) as [bigint, bigint];

  if (balance < amount) {
    throw new AppError(
      `Escrow funding wallet ${owner.address} has insufficient token balance. ` +
        `Required ${await formatUnitsForMessage(amount)}, available ${await formatUnitsForMessage(balance)} ` +
        `for token ${env.ESCROW_TOKEN_ADDRESS}.`,
      StatusCodes.CONFLICT,
    );
  }

  if (allowance >= amount) return;

  logger.info(
    `saleEscrow: approving ${env.SALE_ESCROW_CONTRACT_ADDRESS} to spend ${await formatUnitsForMessage(amount)} token(s) from ${owner.address}`,
  );
  const tx = await token.approve(env.SALE_ESCROW_CONTRACT_ADDRESS, amount);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new AppError(
      "Sale escrow token approval transaction failed",
      StatusCodes.BAD_GATEWAY,
    );
  }
};

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
  await assertNotMainnet();
  await assertEscrowContractReady();
  await ensureTokenFundingApproval(input.amount);
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
  await assertNotMainnet();
  const { contract } = getContract();
  const tx = await contract[method](escrowId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

export const releaseEscrow = (id: string): Promise<EscrowTx> =>
  call("release", id);
export const refundEscrow = (id: string): Promise<EscrowTx> =>
  call("refund", id);

// State enum: 0=None, 1=Funded, 2=Released, 3=Refunded
const STATE_LABELS = ["none", "funded", "released", "refunded"] as const;

export interface OnChainSaleEscrow {
  state: (typeof STATE_LABELS)[number];
  buyer: string;
  seller: string;
  amount: string;
  termsHash: string;
}

export const getEscrow = async (
  escrowId: string,
): Promise<OnChainSaleEscrow> => {
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
  cachedDecimals = null;
  cachedChainId = null;
};
