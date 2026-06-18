// Mock side-effect services before any application imports.
jest.mock("../src/modules/notifications/notification.service", () => ({
  notify: jest.fn(async () => {}),
}));

import mongoose from "mongoose";
import { Wallet } from "ethers";
import { StatusCodes } from "http-status-codes";
import { User } from "../src/modules/auth/auth.model";
import { Lease } from "../src/modules/leases/lease.model";
import { AppError } from "../src/core/utils/AppError";
import * as authService from "../src/modules/auth/auth.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeUser = async (email: string) =>
  User.create({
    name: "Wallet User",
    email,
    password: "Password123!",
    role: "tenant",
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("wallet link lifecycle", () => {
  it("challenge → walletStatus becomes pending_signature", async () => {
    const user = await makeUser("wl1@example.com");
    const ethWallet = Wallet.createRandom();

    await authService.createWalletChallenge(user.id, ethWallet.address);

    const fresh = await User.findById(user.id);
    expect(fresh?.walletStatus).toBe("pending_signature");
    // challenge is stored (but stripped from toJSON, so we read raw doc)
    expect(fresh?.walletLinkChallenge).toBeDefined();
  });

  it("full link flow → walletStatus becomes linked", async () => {
    const user = await makeUser("wl2@example.com");
    const ethWallet = Wallet.createRandom();

    // Create challenge and capture the message to sign.
    const { message } = await authService.createWalletChallenge(
      user.id,
      ethWallet.address,
    );

    // Sign the exact challenge message with the ethers Wallet.
    const signature = await ethWallet.signMessage(message);

    const publicUser = await authService.linkWallet(
      user.id,
      ethWallet.address,
      signature,
    );

    expect(publicUser.walletStatus).toBe("linked");
    expect(publicUser.walletAddress).toBe(ethWallet.address.toLowerCase());

    const fresh = await User.findById(user.id);
    expect(fresh?.walletStatus).toBe("linked");
  });

  it("revokeWallet → walletStatus becomes revoked and address is cleared", async () => {
    const user = await makeUser("wl3@example.com");
    const ethWallet = Wallet.createRandom();

    // Link first.
    const { message } = await authService.createWalletChallenge(
      user.id,
      ethWallet.address,
    );
    const signature = await ethWallet.signMessage(message);
    await authService.linkWallet(user.id, ethWallet.address, signature);

    // Now revoke.
    const publicUser = await authService.revokeWallet(user.id);
    expect(publicUser.walletStatus).toBe("revoked");
    expect(publicUser.walletAddress).toBeUndefined();

    const fresh = await User.findById(user.id);
    expect(fresh?.walletStatus).toBe("revoked");
    expect(fresh?.walletAddress).toBeUndefined();
  });

  it("revokeWallet on a user with no linked wallet sets revoked status", async () => {
    const user = await makeUser("wl4@example.com");
    const publicUser = await authService.revokeWallet(user.id);
    expect(publicUser.walletStatus).toBe("revoked");
  });

  it("revokeWallet on non-existent user throws AppError", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(authService.revokeWallet(fakeId)).rejects.toBeInstanceOf(AppError);
  });

  it("revokeWallet throws CONFLICT when user has an active/funded lease escrow", async () => {
    const user = await makeUser("wl6@example.com");

    // Stub Lease.findOne to simulate an active escrow involving this user.
    const findOneSpy = jest
      .spyOn(Lease, "findOne")
      .mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        landlord: user.id,
        status: "active",
        escrow: { state: "active" },
      } as never);

    const err = await authService.revokeWallet(user.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(StatusCodes.CONFLICT);

    findOneSpy.mockRestore();
  });

  it("createWalletChallenge does NOT set walletAddress on the user", async () => {
    const user = await makeUser("wl7@example.com");
    const ethWallet = Wallet.createRandom();

    await authService.createWalletChallenge(user.id, ethWallet.address);

    const fresh = await User.findById(user.id);
    // walletAddress must remain unset — only the challenge is stored so that
    // the DB uniqueness constraint on walletAddress is not violated early.
    expect(fresh?.walletAddress).toBeUndefined();
    expect(fresh?.walletStatus).toBe("pending_signature");
    expect(fresh?.walletLinkChallenge?.walletAddress).toBe(
      ethWallet.address.toLowerCase(),
    );
  });
});
