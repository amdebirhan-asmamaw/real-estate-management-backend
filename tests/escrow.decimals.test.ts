/**
 * D2 tests: token-decimals safety + testnet-only (mainnet guard).
 *
 * Strategy:
 *  - Unit-test getTokenDecimals and toBaseUnits by controlling the mock
 *    Contract's decimals() return value and the env vars. This avoids needing
 *    a real provider and is simpler / faster.
 *  - The mainnet guard (assertNotMainnet) reads provider.getNetwork(); we mock
 *    the provider to return chainId=1 and assert that openAndFundEscrow throws.
 *
 * We test BOTH leaseEscrow and saleEscrow services; they share the same design
 * so a symmetrical test suite confirms both are correct.
 */

// ── Mock ethers so we can inject fake provider / contract behaviour ───────────
const mockGetNetwork = jest.fn();
const mockDecimalsCall = jest.fn();
const mockOpenAndFund = jest.fn();
const mockRelease = jest.fn();
const mockRefund = jest.fn();
const mockActivate = jest.fn();

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers") as typeof import("ethers");

  // A fake Contract that routes method calls to our jest mocks.
  class FakeContract {
    interface = { parseLog: () => null };
    decimals = mockDecimalsCall;
    openAndFund = mockOpenAndFund;
    release = mockRelease;
    refund = mockRefund;
    activate = mockActivate;
  }

  class FakeWallet {
    constructor(public _key: string, public _provider: unknown) {}
  }

  class FakeProvider {
    getNetwork = mockGetNetwork;
  }

  return {
    ...actual,
    JsonRpcProvider: FakeProvider,
    Wallet: FakeWallet,
    Contract: FakeContract,
  };
});

// ── Configure minimal env before modules are imported ────────────────────────
process.env.BLOCKCHAIN_RPC_URL = "http://localhost:8545";
process.env.MINTER_PRIVATE_KEY = "0x" + "1".repeat(64);
process.env.ESCROW_CONTRACT_ADDRESS = "0x" + "2".repeat(40);
process.env.ESCROW_TOKEN_ADDRESS = "0x" + "3".repeat(40);
process.env.SALE_ESCROW_CONTRACT_ADDRESS = "0x" + "4".repeat(40);

import { parseUnits } from "ethers";
import * as leaseEscrow from "../src/core/blockchain/leaseEscrow.service";
import * as saleEscrow from "../src/core/blockchain/saleEscrow.service";

// ── Helper: reset module caches between tests ─────────────────────────────────
beforeEach(() => {
  leaseEscrow._resetCache();
  saleEscrow._resetCache();
  mockGetNetwork.mockReset();
  mockDecimalsCall.mockReset();
  mockOpenAndFund.mockReset();
  mockRelease.mockReset();
  mockRefund.mockReset();
  mockActivate.mockReset();
  // Default: Sepolia (not mainnet).
  mockGetNetwork.mockResolvedValue({ chainId: BigInt(11155111) });
});

// ── leaseEscrow: getTokenDecimals ─────────────────────────────────────────────

describe("leaseEscrow.getTokenDecimals", () => {
  it("returns the token's actual decimals when the call succeeds (6-decimal token)", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(6));

    const decimals = await leaseEscrow.getTokenDecimals();

    expect(decimals).toBe(6);
  });

  it("falls back to 18 when the decimals() call fails", async () => {
    mockDecimalsCall.mockRejectedValue(new Error("call reverted"));

    const decimals = await leaseEscrow.getTokenDecimals();

    expect(decimals).toBe(18);
  });

  it("caches the decimals value on second call", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(6));

    await leaseEscrow.getTokenDecimals(); // first call
    await leaseEscrow.getTokenDecimals(); // second call — must use cache

    expect(mockDecimalsCall).toHaveBeenCalledTimes(1);
  });
});

describe("leaseEscrow settlement calls mainnet guard", () => {
  it("blocks activate on mainnet before calling the contract", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) });

    await expect(leaseEscrow.activateEscrow("1")).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(mockActivate).not.toHaveBeenCalled();
  });
});

describe("saleEscrow settlement calls mainnet guard", () => {
  it("blocks release and refund on mainnet before calling the contract", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) });

    await expect(saleEscrow.releaseEscrow("1")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(saleEscrow.refundEscrow("1")).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

// ── leaseEscrow: toBaseUnits (scaling helper) ─────────────────────────────────

describe("leaseEscrow.toBaseUnits", () => {
  it("scales amount using 6 decimals when token has 6 decimals", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(6));

    const result = await leaseEscrow.toBaseUnits(1500);

    // 1500 * 10^6 = 1_500_000_000
    expect(result).toBe(parseUnits("1500", 6));
  });

  it("scales amount using 18 decimals when token has 18 decimals", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(18));

    const result = await leaseEscrow.toBaseUnits(1);

    expect(result).toBe(parseUnits("1", 18));
  });

  it("uses fallback 18 when decimals read fails", async () => {
    mockDecimalsCall.mockRejectedValue(new Error("no provider"));

    const result = await leaseEscrow.toBaseUnits(2);

    expect(result).toBe(parseUnits("2", 18));
  });
});

// ── saleEscrow: getTokenDecimals ──────────────────────────────────────────────

describe("saleEscrow.getTokenDecimals", () => {
  it("returns the token's actual decimals (6-decimal token)", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(6));

    const decimals = await saleEscrow.getTokenDecimals();

    expect(decimals).toBe(6);
  });

  it("falls back to 18 when decimals() call fails", async () => {
    mockDecimalsCall.mockRejectedValue(new Error("reverted"));

    const decimals = await saleEscrow.getTokenDecimals();

    expect(decimals).toBe(18);
  });
});

// ── saleEscrow: toBaseUnits ───────────────────────────────────────────────────

describe("saleEscrow.toBaseUnits", () => {
  it("scales 100 at 6 decimals to 100_000_000", async () => {
    mockDecimalsCall.mockResolvedValue(BigInt(6));

    const result = await saleEscrow.toBaseUnits(100);

    expect(result).toBe(parseUnits("100", 6));
  });
});

// ── Mainnet guard: leaseEscrow ────────────────────────────────────────────────

describe("leaseEscrow.openAndFundEscrow — mainnet guard", () => {
  beforeEach(() => {
    // Token decimals — always resolve for these tests.
    mockDecimalsCall.mockResolvedValue(BigInt(18));
  });

  it("throws FORBIDDEN when connected to mainnet and ALLOW_MAINNET_ESCROW is false", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) }); // Ethereum mainnet
    // ALLOW_MAINNET_ESCROW defaults to false in env.ts.

    await expect(
      leaseEscrow.openAndFundEscrow({
        leaseId: "lease-1",
        landlord: "0x" + "a".repeat(40),
        tenant: "0x" + "b".repeat(40),
        rentAmount: parseUnits("1000", 18),
        depositAmount: parseUnits("2000", 18),
        termsHash: "0x" + "c".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Contract must NOT have been called.
    expect(mockOpenAndFund).not.toHaveBeenCalled();
  });

  it("does NOT throw when connected to a testnet (chainId != 1)", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(11155111) }); // Sepolia

    // openAndFund resolves — mock a minimal receipt-like response.
    mockOpenAndFund.mockResolvedValue({
      wait: async () => ({ hash: "0xfund", logs: [] }),
    });

    // Will throw BAD_GATEWAY ("no EscrowFunded event") because logs are empty —
    // that's fine; it got past the mainnet guard.
    await expect(
      leaseEscrow.openAndFundEscrow({
        leaseId: "lease-1",
        landlord: "0x" + "a".repeat(40),
        tenant: "0x" + "b".repeat(40),
        rentAmount: parseUnits("1000", 18),
        depositAmount: parseUnits("2000", 18),
        termsHash: "0x" + "c".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 502 }); // BAD_GATEWAY, not FORBIDDEN

    expect(mockOpenAndFund).toHaveBeenCalled();
  });
});

// ── Mainnet guard: saleEscrow ─────────────────────────────────────────────────

describe("saleEscrow.openAndFundEscrow — mainnet guard", () => {
  beforeEach(() => {
    mockDecimalsCall.mockResolvedValue(BigInt(18));
  });

  it("throws FORBIDDEN when connected to mainnet and ALLOW_MAINNET_ESCROW is false", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) });

    await expect(
      saleEscrow.openAndFundEscrow({
        saleId: "sale-1",
        buyer: "0x" + "a".repeat(40),
        seller: "0x" + "b".repeat(40),
        amount: parseUnits("500000", 18),
        termsHash: "0x" + "c".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockOpenAndFund).not.toHaveBeenCalled();
  });

  it("passes through on a testnet (Sepolia)", async () => {
    mockGetNetwork.mockResolvedValue({ chainId: BigInt(11155111) });

    mockOpenAndFund.mockResolvedValue({
      wait: async () => ({ hash: "0xfund", logs: [] }),
    });

    // BAD_GATEWAY because no EscrowFunded event in empty logs — not FORBIDDEN.
    await expect(
      saleEscrow.openAndFundEscrow({
        saleId: "sale-1",
        buyer: "0x" + "a".repeat(40),
        seller: "0x" + "b".repeat(40),
        amount: parseUnits("500000", 18),
        termsHash: "0x" + "c".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(mockOpenAndFund).toHaveBeenCalled();
  });
});
