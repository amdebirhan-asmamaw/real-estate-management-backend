# PRD — Increment 2: On-Chain Property Titles (Backend Integration)

**Product:** Decentralized Real Estate Platform
**Increment:** 2 of N
**Scope:** Backend chain-integration only. The Solidity/Hardhat contract lives in the separate `real-estate-contracts` repo; this increment delivers the backend that mints and verifies titles against it.
**Status:** Backend implemented ✅ · contract repo scaffolded ✅ (`real-estate-contracts`: PropertyTitle.sol, Hardhat tests, deploy + ABI export)

---

## 1. Background

Increment 1 produced a verified off-chain marketplace: an admin reviews a property owner's private ownership documents and, on approval, the listing's `verificationStatus` becomes `verified` and the approved title-deed hash is anchored in `ownershipDocumentHash`. Increment 2 takes that trusted hash on-chain — minting an ERC-721 **digital title** that immutably records the listing and its document hash, so ownership can be independently verified against the blockchain.

## 2. Goals & Non-Goals

**Goals**
- Mint a digital title (NFT) for a verified listing via an explicit, audited admin action.
- Anchor the listing id + sha-256 ownership-document hash on-chain.
- Expose public verification comparing the on-chain hash to the off-chain record.
- Record `tokenId`, `contractAddress`, `blockchainTxHash`, `titleCertificateId` on the listing.

**Non-Goals**
- Minting to a property owner's own wallet (custodial/platform-held for now; `walletAddress` is groundwork).
- Escrow, transfers, or rental-agreement contracts (later increments).
- The Hardhat contract project itself (separate repo; see the hardening plan Phase 3).

## 3. Ownership & Trigger Model

- **Custodial:** the platform's minter wallet (`MINTER_PRIVATE_KEY`) owns minted titles. The off-chain listing records the token. A later increment can mint directly to owner wallets.
- **Explicit admin action:** minting is `POST /listings/:id/mint-title` (admin only) — never automatic. A listing must be `verificationStatus === verified`, have an `ownershipDocumentHash`, and an approved `title_deed` before it can be published (enforced in the publish transition) and before a title is minted (enforced in `mintTitle`). Minting is mint-once.

## 4. Functional Requirements

- FR-1: An admin can mint a title for a verified listing; the service rejects unverified listings, listings without an anchored hash, and double-minting (409).
- FR-2: Minting anchors `listingId` + `documentHash` on-chain and records `tokenId`, `contractAddress`, `blockchainTxHash`, and `titleCertificateId` (`PTITLE-<tokenId>`) on the listing; the event is audited (`listing.title_minted`).
- FR-3: `GET /listings/:id/title` returns the on-chain owner and document hash and a `verified` flag (on-chain hash === off-chain `ownershipDocumentHash`). Visible per normal listing visibility rules; 404 when nothing is minted.
- FR-4: The chain integration fails fast (`503`) when blockchain env is unconfigured, so the rest of the API is unaffected.

## 5. API Surface (`/api/v1`)

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/listings/:id/mint-title` | admin | Mint the digital title for a verified listing |
| GET | `/listings/:id/title` | optional | On-chain owner + document-hash verification |

## 6. Technical Notes

- **Chain service:** `src/core/blockchain/propertyTitle.service.ts` (ethers v6) wraps a `JsonRpcProvider` + custodial `Wallet` + `Contract`. `mintTitle` parses the `TitleMinted` event for the tokenId; `getTitle` reads `ownerOf` + `documentHashOf`. Memoized; mockable in tests (`jest.mock`).
- **ABI:** `src/core/blockchain/propertyTitle.abi.ts` mirrors `docs/contracts/PropertyTitle.sol`. To be replaced by the compiled ABI exported from the contracts repo once scaffolded.
- **Env (all optional to boot):** `BLOCKCHAIN_RPC_URL`, `TITLE_CONTRACT_ADDRESS`, `MINTER_PRIVATE_KEY`.
- **Contract (separate repo):** `PropertyTitle` ERC-721, `mintTitle(address,string,bytes32) onlyOwner`, `documentHashOf`, `listingIdOf`, `TitleMinted` event.

## 7. Acceptance Criteria (met for the backend)

- Admin mints a title for a verified listing; non-admins are forbidden (403); unverified/duplicate mints are rejected (409). ✅
- Public `GET /listings/:id/title` reports `verified: true` when hashes match and `false` when tampered; 404 when unminted. ✅
- Chain service is unit-tested with mocked ethers; mint/verify covered at service and HTTP layers. ✅
- `lint`, `typecheck`, `test`, `build` pass. ✅

## 8. Status

- The `real-estate-contracts` Hardhat project is scaffolded (PropertyTitle.sol, 5 passing tests, deploy + `export-abi` scripts). To run end-to-end against a real chain: start a local node, `npm run deploy:local`, then set `BLOCKCHAIN_RPC_URL` / `TITLE_CONTRACT_ADDRESS` / `MINTER_PRIVATE_KEY` in the backend `.env` (see the contracts repo README). The backend ABI is parity-matched with the compiled ABI.
