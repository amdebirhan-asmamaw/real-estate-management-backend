jest.mock("../src/core/config/env", () => ({
  env: {
    BLOCKCHAIN_RPC_URL: "http://127.0.0.1:8545",
    TITLE_CONTRACT_ADDRESS: "0xContract",
    MINTER_PRIVATE_KEY: "0xkey",
    isTest: true,
  },
}));

const mintTx = {
  wait: jest.fn().mockResolvedValue({
    hash: "0xtxhash",
    logs: [{ topics: [], data: "0x" }],
  }),
};

const mockContract = {
  mintTitle: jest.fn().mockResolvedValue(mintTx),
  ownerOf: jest.fn().mockResolvedValue("0xOwnerAddress"),
  documentHashOf: jest.fn().mockResolvedValue("0xabc123"),
  interface: {
    parseLog: jest.fn().mockReturnValue({
      name: "TitleMinted",
      args: { tokenId: { toString: () => "1" } },
    }),
  },
};

jest.mock("ethers", () => ({
  JsonRpcProvider: jest.fn(),
  Wallet: jest.fn().mockImplementation(() => ({ address: "0xMinterAddress" })),
  Contract: jest.fn().mockImplementation(() => mockContract),
}));

import {
  isConfigured,
  mintTitle,
  getTitle,
} from "../src/core/blockchain/propertyTitle.service";

describe("propertyTitle.service", () => {
  it("reports configured when env is set", () => {
    expect(isConfigured()).toBe(true);
  });

  it("mints a title to the custodial minter by default and returns the tokenId", async () => {
    const result = await mintTitle({
      listingId: "listing123",
      documentHash: "deadbeef",
    });
    expect(result.tokenId).toBe("1");
    expect(result.txHash).toBe("0xtxhash");
    expect(result.owner).toBe("0xMinterAddress");
    expect(mockContract.mintTitle).toHaveBeenCalledWith(
      "0xMinterAddress",
      "listing123",
      "0xdeadbeef",
    );
  });

  it("reads the on-chain owner and document hash (without 0x prefix)", async () => {
    const title = await getTitle("1");
    expect(title.owner).toBe("0xOwnerAddress");
    expect(title.documentHash).toBe("abc123");
  });
});
