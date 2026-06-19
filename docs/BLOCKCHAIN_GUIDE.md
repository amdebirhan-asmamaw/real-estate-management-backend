# Blockchain Integration Guide — Frontend & Fullstack Reference

> Companion to `FRONTEND_GUIDE.md`, `LISTINGS_GUIDE.md`, and `USER_VERIFICATION_GUIDE.md`.
> Covers both smart contracts in depth, the custodial trust model, backend env wiring,
> frontend ethers.js setup, and every API surface that touches the chain.

---

## 1. Architecture Overview

This platform uses two Ethereum smart contracts deployed from the `real-estate-contracts` Hardhat project:

```
┌──────────────────┐        REST API         ┌─────────────────────────────────┐
│   Frontend       │ ◀─────────────────────▶ │   Backend (Node/Express)        │
│  (ethers.js)     │                          │                                 │
│                  │   Wallet sign / read      │  ┌──────────────────────────┐  │
│  - Wallet link   │ ──────────────────────▶  │  │ propertyTitle.service.ts │  │
│  - Title verify  │                          │  │ leaseEscrow.service.ts   │  │
│  - Escrow view   │                          │  └──────────┬───────────────┘  │
└──────────────────┘                          └─────────────┼───────────────────┘
                                                            │ ethers.js (server)
                                                            ▼
                                              ┌─────────────────────────────────┐
                                              │   EVM Chain (local / Sepolia)   │
                                              │                                 │
                                              │  PropertyTitle (ERC-721)        │
                                              │  LeaseEscrow  (ERC-20 escrow)   │
                                              └─────────────────────────────────┘
```

### Custodial model (current)

All **write** operations to the chain are performed by the **backend's minter wallet**
(`MINTER_PRIVATE_KEY`). The frontend never signs contract transactions — it only:

1. Signs a **personal message** to link its wallet address (SIWE-style challenge)
2. Reads on-chain data directly from the contracts (read-only calls, no gas)

The wallet address stored in the user's profile is used as the **recipient** when the
admin mints a title, and as the **landlord/tenant** addresses recorded in escrow.

---

## 2. The Two Contracts

### 2.1 PropertyTitle — ERC-721 Digital Title

**File:** `real-estate-contracts/contracts/PropertyTitle.sol`  
**Standard:** ERC-721 (NFT) + OpenZeppelin AccessControl + Pausable  
**Token symbol:** `PTITLE`

Each token represents a verified property title. It anchors:
- The off-chain `listingId` (MongoDB ObjectId string)
- A `bytes32` SHA-256 hash of the approved title deed document

| Function | Role required | Description |
|---|---|---|
| `mintTitle(to, listingId, documentHash)` | `TITLE_OPERATOR_ROLE` | Mint one title per listing |
| `markDisputed(tokenId, reason)` | `TITLE_OPERATOR_ROLE` | Active → Disputed |
| `clearDispute(tokenId, reason)` | `TITLE_OPERATOR_ROLE` | Disputed → Active |
| `revokeTitle(tokenId, reason)` | `TITLE_OPERATOR_ROLE` | Any → Revoked (permanent) |
| `ownerOf(tokenId)` | public | ERC-721 owner |
| `documentHashOf(tokenId)` | public | Anchored SHA-256 hash |
| `listingIdOf(tokenId)` | public | Off-chain listing ID |
| `tokenIdOfListing(listingId)` | public | Reverse lookup by listing |
| `titleStatusOf(tokenId)` | public | 0=None, 1=Active, 2=Disputed, 3=Revoked |

**Title status enum:**
```
None(0) — token doesn't exist
Active(1) — valid title
Disputed(2) — ownership contested, listing suspended on backend
Revoked(3) — permanently invalidated, listing archived
```

**One title per listing** — the contract reverts `ListingAlreadyMinted` if you try to mint twice for the same `listingId`.

---

### 2.2 LeaseEscrow — ERC-20 Stablecoin Escrow

**File:** `real-estate-contracts/contracts/LeaseEscrow.sol`  
**Standard:** AccessControl + Pausable + ReentrancyGuard  
**Token:** Any ERC-20 allowlisted by the contract owner (MockERC20 on testnet; real stablecoin on mainnet)

Holds **first month's rent + security deposit** for each lease:
- On `openAndFund` → contract receives `rentAmount + depositAmount`
- On `activate` → `rentAmount` released to landlord (first month paid)
- On lease end → `depositAmount` sent to landlord (`releaseDeposit`) or tenant (`refundDeposit`)

| Function | Role required | Description |
|---|---|---|
| `openAndFund(...)` | `ESCROW_OPERATOR_ROLE` | Open escrow and pull tokens from caller |
| `activate(escrowId)` | `ESCROW_OPERATOR_ROLE` | Release first-month rent to landlord |
| `cancel(escrowId)` | `ESCROW_OPERATOR_ROLE` | Refund all to tenant (pre-activation) |
| `releaseDeposit(escrowId)` | `ESCROW_OPERATOR_ROLE` | Send deposit to landlord (termination) |
| `refundDeposit(escrowId)` | `ESCROW_OPERATOR_ROLE` | Return deposit to tenant (completion) |
| `getEscrow(escrowId)` | public | Full escrow struct |
| `escrowState(escrowId)` | public | 0=None, 1=Funded, 2=Active, 3=Closed |

**Escrow state machine:**
```
Funded ──activate──▶ Active ──releaseDeposit──▶ Closed (landlord keeps deposit)
       ──cancel──▶ Closed   ──refundDeposit──▶ Closed  (tenant gets deposit back)
```

> ⚠️ **Token constraint:** Only standard ERC-20 tokens (no fee-on-transfer, no rebasing).
> The contract pulls `rentAmount + depositAmount` in one `safeTransferFrom` call.

---

## 3. Prerequisites

### 3.1 Contracts Repo Setup

```bash
cd d:/PROJECTS/real-estate-contracts
npm install          # installs Hardhat, ethers, OpenZeppelin, typechain
npm run compile      # compiles Solidity → artifacts/ + typechain-types/
npm test             # run contract test suite (uses in-process Hardhat network)
```

**Required versions:**
- Node.js ≥ 20.x
- npm ≥ 9.x
- Solidity 0.8.24 (EVM target: `cancun` — required for OpenZeppelin 5.x `mcopy` opcode)

### 3.2 Local Dev Chain

Open a **dedicated terminal** and keep it running:

```bash
# Terminal 1 — blockchain node
npm run node
# Starts Hardhat node at http://127.0.0.1:8545
# 20 pre-funded accounts, Account #0 = 0xf39Fd6...
```

Deploy all contracts (Terminal 2):

```bash
npm run deploy:local
# Writes deployments/localhost.json with all addresses
```

Export minimal ABIs for frontend use:

```bash
npm run export-abi
# Writes abi/PropertyTitle.json, abi/LeaseEscrow.json, abi/MockERC20.json
```

### 3.3 Known Local Addresses (Hardhat)

After `npm run deploy:local`, the addresses are always the same:

```json
{
  "propertyTitle": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "leaseEscrow":   "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  "mockToken":     "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
}
```

> The Hardhat node is **ephemeral** — restarting it resets all state. You must redeploy each time.

---

## 4. Backend Environment Variables

All blockchain variables are **optional at startup** — the app boots without them.
The relevant services throw `503 Service Unavailable` if used while unconfigured.

```env
# real-estate-backend/.env

# ─── Required for any feature ────────────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/real-estate
JWT_SECRET=<min-32-chars>
JWT_REFRESH_SECRET=<min-32-chars-different-from-JWT_SECRET>

# ─── Cloudinary (photo + KYC document storage) ───────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ─── Blockchain — PropertyTitle ───────────────────────────────────────────────
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
TITLE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
MINTER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ─── Blockchain — LeaseEscrow ────────────────────────────────────────────────
ESCROW_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
ESCROW_TOKEN_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

> `MINTER_PRIVATE_KEY` above is Hardhat Account #0. **Never use this on mainnet or Sepolia.**

### Sepolia testnet config

```env
BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
TITLE_CONTRACT_ADDRESS=<from deployments/sepolia.json>
MINTER_PRIVATE_KEY=<your deployer private key>
ESCROW_CONTRACT_ADDRESS=<from deployments/sepolia.json>
ESCROW_TOKEN_ADDRESS=<MockERC20 or real stablecoin address>
```

### Role grants (if backend wallet ≠ deployer)

The deployer wallet auto-receives both operator roles. If you use a separate backend wallet:

```bash
npx hardhat console --network localhost
```

```js
const title = await ethers.getContractAt("PropertyTitle", "<TITLE_ADDRESS>");
await title.grantRole(await title.TITLE_OPERATOR_ROLE(), "<BACKEND_WALLET>");

const escrow = await ethers.getContractAt("LeaseEscrow", "<ESCROW_ADDRESS>");
await escrow.grantRole(await escrow.ESCROW_OPERATOR_ROLE(), "<BACKEND_WALLET>");
```

---

## 5. Feature Gate: `isConfigured()`

Both blockchain services export an `isConfigured()` check. The backend uses this to return
`503` gracefully instead of crashing:

```ts
// propertyTitle.service.ts
export const isConfigured = (): boolean =>
  Boolean(env.BLOCKCHAIN_RPC_URL && env.TITLE_CONTRACT_ADDRESS && env.MINTER_PRIVATE_KEY);

// leaseEscrow.service.ts
export const isConfigured = (): boolean =>
  Boolean(
    env.BLOCKCHAIN_RPC_URL && env.ESCROW_CONTRACT_ADDRESS &&
    env.ESCROW_TOKEN_ADDRESS && env.MINTER_PRIVATE_KEY,
  );
```

**Frontend:** When any blockchain endpoint returns `503`, show a banner:
> "Blockchain features are not available right now."

Do not hard-fail — the rest of the app works without it.

---

## 6. Frontend ethers.js Setup

The frontend uses ethers.js **only** for:
1. Connecting a browser wallet (MetaMask / WalletConnect)
2. Signing the wallet-link challenge message
3. Making **read-only** contract calls (title status, escrow state, owner address)

### Install

```bash
npm install ethers
# or
yarn add ethers
```

Tested with ethers **v6.x** (same version used by the backend). If you use wagmi/viem, the concepts map 1:1 but syntax differs.

### Provider & signer

```ts
import { BrowserProvider, Contract } from "ethers";

// Connect to the user's injected wallet (MetaMask etc.)
const getProvider = async () => {
  if (!window.ethereum) throw new Error("No wallet detected");
  return new BrowserProvider(window.ethereum);
};

const getSigner = async () => {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
```

### Read-only provider (no wallet needed)

For displaying title / escrow data without requiring the user to connect:

```ts
import { JsonRpcProvider } from "ethers";

// Point at the same RPC the backend uses
const readProvider = new JsonRpcProvider(
  import.meta.env.VITE_BLOCKCHAIN_RPC_URL ?? "http://127.0.0.1:8545"
);
```

### Environment variables (Vite example)

```env
# .env (frontend)
VITE_BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
VITE_TITLE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_ESCROW_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
VITE_ESCROW_TOKEN_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

For Next.js replace `VITE_` with `NEXT_PUBLIC_`.

---

## 7. Wallet Linking — Full Frontend Flow

Wallet linking is a **3-step challenge/sign/link** flow. No smart contract call is needed —
it uses EIP-191 personal message signing.

### Step 1 — User clicks "Connect Wallet"

```ts
const signer = await getSigner();
const walletAddress = await signer.getAddress(); // e.g. "0xabc...123"
```

### Step 2 — Request a signing challenge from the backend

```ts
const challenge = await api("/auth/wallet/challenge", {
  method: "POST",
  body: JSON.stringify({ walletAddress }),
});
// {
//   walletAddress: "0xabc...123",
//   message: "Real Estate Marketplace wallet linking\n\nUser: <userId>\nWallet: 0xabc...123\nNonce: <hex>\nExpires At: <iso>",
//   expiresAt: "2026-06-17T11:05:00Z"
// }
```

The challenge expires in **10 minutes**. Start a countdown timer in the UI.

### Step 3 — Sign the message

```ts
const signature = await signer.signMessage(challenge.message);
// MetaMask shows a human-readable popup with challenge.message
```

### Step 4 — Send signature to backend

```ts
const user = await api("/auth/wallet/link", {
  method: "POST",
  body: JSON.stringify({ walletAddress, signature }),
});
// user.walletStatus === "linked"
// user.walletAddress === "0xabc...123"
```

The backend verifies the signature cryptographically using ethers `verifyMessage`. If the recovered address matches `walletAddress` and the wallet isn't already linked to another account, the wallet is linked.

### Unlink wallet

```ts
await api("/auth/wallet", { method: "DELETE" });
// 409 if user has active/funded lease escrows
```

### walletStatus flow

```
unlinked ──challenge issued──▶ pending_signature ──sign+link──▶ linked
                                                               ──(admin)──▶ revoked
linked ──unlink──▶ unlinked
```

### Complete React example

```tsx
import { BrowserProvider } from "ethers";
import { useState } from "react";

export function WalletConnect() {
  const [status, setStatus] = useState<string>("idle");

  const handleConnect = async () => {
    setStatus("connecting");
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();

      // 1. Get challenge
      setStatus("awaiting_signature");
      const challenge = await api("/auth/wallet/challenge", {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
      });

      // 2. Sign
      const signature = await signer.signMessage(challenge.message);

      // 3. Link
      setStatus("linking");
      await api("/auth/wallet/link", {
        method: "POST",
        body: JSON.stringify({ walletAddress, signature }),
      });

      setStatus("linked");
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("rejected"))
        setStatus("rejected"); // user cancelled MetaMask popup
      else setStatus("error");
    }
  };

  return (
    <button onClick={handleConnect} disabled={status === "linking"}>
      {status === "idle" && "Connect Wallet"}
      {status === "awaiting_signature" && "Check your wallet…"}
      {status === "linking" && "Linking…"}
      {status === "linked" && "Wallet Linked ✓"}
    </button>
  );
}
```

---

## 8. Reading On-Chain Title Data (Frontend)

The frontend can read title data **directly from the contract** without going through the backend.
This is read-only — no gas, no wallet required.

### Minimal ABI for frontend reads

```ts
// src/lib/contracts/propertyTitle.ts
export const PROPERTY_TITLE_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function documentHashOf(uint256 tokenId) view returns (bytes32)",
  "function listingIdOf(uint256 tokenId) view returns (string)",
  "function tokenIdOfListing(string listingId) view returns (uint256)",
  "function titleStatusOf(uint256 tokenId) view returns (uint8)",
  "event TitleMinted(uint256 indexed tokenId, address indexed to, string listingId, bytes32 documentHash)",
  "event TitleStatusChanged(uint256 indexed tokenId, uint8 indexed status, string reason)",
] as const;
```

### Read title for a listing

```ts
import { JsonRpcProvider, Contract } from "ethers";

const TITLE_STATUS = ["none", "active", "disputed", "revoked"] as const;

async function getTitleForListing(listingId: string) {
  const provider = new JsonRpcProvider(import.meta.env.VITE_BLOCKCHAIN_RPC_URL);
  const contract = new Contract(
    import.meta.env.VITE_TITLE_CONTRACT_ADDRESS,
    PROPERTY_TITLE_ABI,
    provider,
  );

  const tokenId: bigint = await contract.tokenIdOfListing(listingId);
  if (tokenId === 0n) return null; // no title minted

  const [owner, docHash, statusCode] = await Promise.all([
    contract.ownerOf(tokenId),
    contract.documentHashOf(tokenId),
    contract.titleStatusOf(tokenId),
  ]);

  return {
    tokenId: tokenId.toString(),
    owner,                                     // EVM address
    documentHash: docHash.replace(/^0x/, ""), // hex, no prefix
    status: TITLE_STATUS[Number(statusCode)] ?? "none",
  };
}
```

### Via the backend REST API (simpler, recommended for most UIs)

```ts
const title = await api(`/listings/${listingId}/title`);
// {
//   tokenId: "1",
//   contractAddress: "0x5FbDB...",
//   owner: "0xf39Fd...",
//   status: "active",
//   onChainHash: "abc123...",  // from contract
//   offChainHash: "abc123...", // from listing.ownershipDocumentHash
//   verified: true             // true when both hashes match
// }
```

Show a **"Verified on-chain ✓"** badge only when `verified === true`.

### Hash verification logic

```ts
// The "verified" flag is computed server-side:
// verified = (onChainHash === offChainHash)
// This proves the document that was approved hasn't changed since minting.

function TitleBadge({ title }: { title: { verified: boolean; status: string } }) {
  if (title.status === "disputed") return <Badge color="orange">⚠ Disputed</Badge>;
  if (title.status === "revoked")  return <Badge color="red">✗ Revoked</Badge>;
  if (title.verified)              return <Badge color="green">✓ Verified On-Chain</Badge>;
  return null;
}
```

---

## 9. Reading On-Chain Escrow Data (Frontend)

### Minimal ABI for frontend reads

```ts
// src/lib/contracts/leaseEscrow.ts
export const LEASE_ESCROW_ABI = [
  "function getEscrow(uint256 escrowId) view returns (tuple(string leaseId, address landlord, address tenant, address token, uint256 rentAmount, uint256 depositAmount, bytes32 termsHash, uint8 state))",
  "function escrowState(uint256 escrowId) view returns (uint8)",
  "event EscrowFunded(uint256 indexed escrowId, string leaseId, address indexed landlord, address indexed tenant, uint256 rentAmount, uint256 depositAmount)",
  "event RentReleased(uint256 indexed escrowId, address indexed landlord, uint256 amount)",
  "event DepositReleased(uint256 indexed escrowId, address indexed landlord, uint256 amount)",
  "event DepositRefunded(uint256 indexed escrowId, address indexed tenant, uint256 amount)",
] as const;
```

### Read escrow for a lease

```ts
import { JsonRpcProvider, Contract, formatUnits } from "ethers";

const ESCROW_STATE = ["none", "funded", "active", "closed"] as const;
const TOKEN_DECIMALS = 18; // standard ERC-20

async function getEscrowForLease(escrowId: string) {
  const provider = new JsonRpcProvider(import.meta.env.VITE_BLOCKCHAIN_RPC_URL);
  const contract = new Contract(
    import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS,
    LEASE_ESCROW_ABI,
    provider,
  );

  const e = await contract.getEscrow(escrowId);
  return {
    state: ESCROW_STATE[Number(e.state)] ?? "none",
    landlord: e.landlord,
    tenant: e.tenant,
    rentAmount: formatUnits(e.rentAmount, TOKEN_DECIMALS),   // human-readable
    depositAmount: formatUnits(e.depositAmount, TOKEN_DECIMALS),
    termsHash: (e.termsHash as string).replace(/^0x/, ""),
  };
}
```

### Via the backend REST API

```ts
const { lease, onChain } = await api(`/leases/${leaseId}/escrow`);
// lease: full lease document from DB
// onChain: { state, landlord, tenant, rentAmount, depositAmount, termsHash } | null
```

`onChain` is `null` if escrow hasn't been funded yet. Display escrow state alongside the lease status.

---

## 10. PropertyTitle API Endpoints (Backend)

All write operations are admin-only. Reads are public (return `503` if blockchain not configured).

### Mint a title (admin only)

```
POST /listings/:id/mint-title
Authorization: Bearer <admin-token>
```

**Pre-conditions (all must be met or returns `409`):**
1. `listing.verificationStatus === "verified"`
2. An ownership document of type `title_deed` with `status === "approved"` exists
3. `listing.ownershipDocumentHash` is set (auto-set when title deed is approved)
4. `listing.tokenId` is not already set (each listing mints at most one title)
5. Blockchain is configured (`isConfigured() === true`) — else `503`

**What happens server-side:**
1. Calls `contract.mintTitle(recipient, listingId, documentHash)` via the minter wallet
2. Parses the `TitleMinted` event from the transaction receipt to extract `tokenId`
3. Saves `tokenId`, `txHash`, `contractAddress` to the listing document
4. Records a `chainTransaction` audit row

**Response:**
```json
{
  "tokenId": "1",
  "txHash": "0xabc...",
  "contractAddress": "0x5FbDB...",
  "owner": "0xf39Fd..."
}
```

> **Recipient:** Defaults to the minter wallet address. Future increment will use
> `listing.createdBy.walletAddress` if the owner has a linked wallet.

### Read title info (public)

```
GET /listings/:id/title
```

```json
{
  "tokenId": "1",
  "contractAddress": "0x5FbDB...",
  "owner": "0xf39Fd...",
  "status": "active",
  "onChainHash": "sha256hexstring",
  "offChainHash": "sha256hexstring",
  "verified": true
}
```

Returns `404` if no `tokenId` on the listing. Returns `503` if blockchain not configured.

### Dispute a title (admin only)

```
POST /listings/:id/title/dispute
Authorization: Bearer <admin-token>
Body: { "reason": "Ownership contested by third party" }
```

**Backend actions:**
1. Calls `contract.markDisputed(tokenId, reason)` → title status: `Active → Disputed`
2. Transitions listing status: `published → suspended`
3. Records chain transaction audit row
4. Owner notified

### Clear a dispute (admin only)

```
POST /listings/:id/title/clear-dispute
Body: { "reason": "Dispute resolved, ownership confirmed" }
```

**Backend actions:**
1. Calls `contract.clearDispute(tokenId, reason)` → title status: `Disputed → Active`
2. Transitions listing status: `suspended → published`
3. Records chain transaction

### Revoke a title (admin only)

```
POST /listings/:id/title/revoke
Body: { "reason": "Fraudulent documentation" }
```

**Backend actions:**
1. Calls `contract.revokeTitle(tokenId, reason)` → title status: `Any → Revoked` (permanent)
2. Transitions listing status to `archived`
3. Records chain transaction

---

## 11. Lease Escrow API Endpoints (Backend)

### Lease lifecycle overview

```
draft ──propose──▶ proposed ──fund (admin)──▶ proposed+escrow:funded
                                              ──activate (admin)──▶ active+escrow:active
                                              ──cancel──▶ cancelled+escrow:closed
active ──complete (admin)──▶ completed+escrow:closed  (deposit refunded to tenant)
       ──terminate (admin)──▶ terminated+escrow:closed (deposit sent to landlord)
       ──dispute──▶ disputed
proposed/active ──dispute──▶ disputed ──resolve (admin)──▶ cancelled|terminated|completed
```

### Create a lease (landlord/admin)

```
POST /leases
Authorization: Bearer <landlord-or-admin-token>
Body:
{
  "listingId": "64abc...",
  "tenantId": "64def...",
  "monthlyRent": 1500,
  "depositAmount": 3000,
  "currency": "USD",
  "startDate": "2026-08-01",
  "endDate": "2027-07-31",
  "terms": "Standard lease terms..."
}
```

**Constraints:**
- Listing must be `published` and `listingType=rent`
- Caller must be the listing owner or admin
- Both landlord and tenant should have linked wallets **before** escrow funding (not blocked at creation but blocked at fund step)

### Propose a lease (landlord/admin)

```
POST /leases/:id/propose
```

Computes a SHA-256 `termsHash` over the canonical lease fields and sets status to `proposed`.
This hash is later anchored on-chain in the escrow.

### Fund escrow (admin only)

```
POST /leases/:id/fund
```

**Hard requirements (returns `403`/`409` if unmet):**
- Both landlord and tenant must have `walletAddress` set (`walletStatus === "linked"`)
- Both must have `kycStatus === "verified"`
- Lease must be `proposed` and `escrow.state === "none"`
- `termsHash` must exist (lease must be proposed first)
- Blockchain must be configured

**What happens:**
1. Calls `contract.openAndFund(leaseId, landlordWallet, tenantWallet, token, rentAmount, depositAmount, termsHash)`
2. The minter wallet must have sufficient token allowance + balance
3. Contract pulls `rentAmount + depositAmount` tokens from the minter wallet
4. Emits `EscrowFunded` → `escrowId` extracted from receipt
5. Saves `escrowId`, `contractAddress`, `fundTxHash`, wallet addresses to `lease.escrow`

**Token amounts:** Stored in DB as human numbers (e.g. `1500`). Converted to 18-decimal
base units via `parseUnits(amount.toString(), 18)` before the contract call.

### Activate escrow (admin only)

```
POST /leases/:id/activate
```

- Escrow must be `funded`
- Calls `contract.activate(escrowId)` → releases `rentAmount` to landlord immediately
- Lease status → `active`, escrow state → `active`

### Complete a lease (admin only — normal end)

```
POST /leases/:id/complete
```

- Lease must be `active`, escrow must be `active`
- Calls `contract.refundDeposit(escrowId)` → deposit returned to tenant
- Lease status → `completed`, escrow state → `closed`

### Terminate a lease (admin only — early end, tenant at fault)

```
POST /leases/:id/terminate
```

- Calls `contract.releaseDeposit(escrowId)` → deposit sent to landlord
- Lease status → `terminated`, escrow state → `closed`

### Cancel a lease (any party / admin)

```
POST /leases/:id/cancel
```

- Lease must be `proposed`
- If escrow is `funded`, calls `contract.cancel(escrowId)` → full refund to tenant
- Lease status → `cancelled`

### Open a dispute (any party / admin)

```
POST /leases/:id/dispute
```

- Lease must be `proposed` or `active`
- No on-chain call — sets status to `disputed` in DB
- Raises a compliance flag internally

### Resolve a dispute (admin only)

```
POST /leases/:id/dispute/resolve
Body: { "decision": "release_deposit" | "refund_deposit" | "cancel", "note": "..." }
```

| Decision | Escrow state required | On-chain call | Result |
|---|---|---|---|
| `cancel` | `funded` | `cancelEscrow` → full refund to tenant | `cancelled` |
| `release_deposit` | `active` | `releaseDeposit` → deposit to landlord | `terminated` |
| `refund_deposit` | `active` | `refundDeposit` → deposit to tenant | `completed` |

### Get lease + escrow info

```
GET /leases/:id/escrow
```

```json
{
  "lease": {
    "id": "64abc...",
    "status": "active",
    "escrow": {
      "escrowId": "1",
      "contractAddress": "0xe7f17...",
      "token": "0x9fE46...",
      "state": "active",
      "fundTxHash": "0x...",
      "activateTxHash": "0x...",
      "landlordWallet": "0xf39...",
      "tenantWallet": "0x70997..."
    }
  },
  "onChain": {
    "state": "active",
    "landlord": "0xf39...",
    "tenant": "0x70997...",
    "rentAmount": "1500.0",
    "depositAmount": "3000.0",
    "termsHash": "abc123..."
  }
}
```

---

## 12. Chain Transaction Audit Trail

Every on-chain call is tracked in a `ChainTransaction` document:

```ts
{
  operation: "lease_escrow.open_and_fund" | "lease_escrow.activate" |
             "lease_escrow.cancel" | "lease_escrow.release_deposit" |
             "lease_escrow.refund_deposit" | "property_title.mint" |
             "property_title.dispute" | "property_title.clear_dispute" |
             "property_title.revoke",
  status:    "pending" | "mined" | "failed",
  targetType: "lease" | "listing",
  targetId:   "<objectId>",
  txHash:     "0x...",           // set when mined
  contractAddress: "0x...",
  createdBy:  "<userId>",
  metadata:   { ... }
}
```

If a DB write fails **after** a mined transaction, the `ChainTransaction` row is the source of
truth. A reconciliation job can use it to sync DB state with on-chain reality.

---

## 13. KYC Gate for Escrow Funding

This is the critical link between the off-chain KYC verification system and on-chain escrow:

```
Both landlord AND tenant:
  kycStatus === "verified"
  walletAddress set (walletStatus === "linked")

→ Only then can admin call POST /leases/:id/fund
```

If either party has not completed KYC, `POST /leases/:id/fund` returns `403`:
```json
{ "message": "The landlord must complete KYC verification before escrow can be funded" }
```

**Frontend:** Before showing a "Fund Escrow" button to admins, check both users'
`kycStatus` and `walletStatus`. If either is missing, show a status card:

```ts
const canFundEscrow =
  landlord.kycStatus === "verified" && landlord.walletStatus === "linked" &&
  tenant.kycStatus   === "verified" && tenant.walletStatus   === "linked";
```

---

## 14. End-to-End Integration Checklist

Use this when integrating the blockchain features from scratch:

### Infrastructure
- [ ] `real-estate-contracts`: `npm install` + `npm run compile`
- [ ] Start local node: `npm run node` (keep running)
- [ ] Deploy: `npm run deploy:local`
- [ ] Copy addresses to `real-estate-backend/.env`
- [ ] Verify backend connects: `GET /listings/<id>/title` → `503` if not configured, `404` if no token

### Property Title flow
- [ ] Upload title deed → `POST /listings/:id/documents` (type: `title_deed`)
- [ ] Admin approves deed → `POST /listings/:id/documents/:docId/review` (decision: `approve`)
- [ ] Listing verificationStatus → `verified`, `ownershipDocumentHash` set
- [ ] Admin mints title → `POST /listings/:id/mint-title`
- [ ] Admin publishes listing → `POST /listings/:id/transition` (action: `publish`)
- [ ] Frontend reads title → `GET /listings/:id/title` → show verified badge

### Lease Escrow flow
- [ ] Both users have `walletStatus === "linked"` (wallet challenge → sign → link)
- [ ] Both users have `kycStatus === "verified"` (KYC upload → admin approve)
- [ ] Minter wallet has sufficient ERC-20 token balance + allowance on the escrow contract
- [ ] Create lease → `POST /leases`
- [ ] Propose lease → `POST /leases/:id/propose`
- [ ] Fund escrow → `POST /leases/:id/fund` (admin)
- [ ] Activate → `POST /leases/:id/activate` (admin — releases first-month rent)
- [ ] At lease end: complete or terminate → deposit settled on-chain

### Frontend client reads
- [ ] ethers.js installed (`npm install ethers`)
- [ ] `VITE_BLOCKCHAIN_RPC_URL` / `VITE_TITLE_CONTRACT_ADDRESS` set
- [ ] `getTitleForListing(listingId)` returns correct status
- [ ] `TitleBadge` component shows correct color per status
- [ ] Wallet connect flow works (MetaMask popup appears on challenge sign)

---

## 15. Error Reference (Blockchain-Specific)

| Code | Endpoint | Cause | Frontend action |
|---|---|---|---|
| `503` | Any `/title` or `/fund` | Blockchain env vars not set | Show "feature unavailable" banner |
| `409` | `mint-title` | Title already minted for this listing | Show "Already minted" — link to title page |
| `409` | `mint-title` | `verificationStatus !== "verified"` | Prompt admin to approve title deed first |
| `409` | `fund` | Escrow already funded | Show current escrow state |
| `409` | `fund` | `termsHash` missing | Prompt landlord to propose lease first |
| `403` | `fund` | KYC not verified for landlord/tenant | Show which party needs to complete KYC |
| `403` | `fund` | Wallet not linked for landlord/tenant | Show which party needs to link wallet |
| `400` | `dispute/resolve` | Wrong escrow state for decision | Check escrow state before showing options |
| `502` | Any chain call | On-chain tx reverted | Show error from `message` field; check node |
| `409` | `wallet/link` | Wallet linked to another account | User must unlink from other account first |
| `409` | `wallet` DELETE | Active/funded lease escrow exists | Explain wallet locked until lease settles |

### Solidity revert reasons (returned in `502` body)

| Revert | Contract | Meaning |
|---|---|---|
| `ListingAlreadyMinted` | PropertyTitle | Duplicate mint attempt |
| `InvalidTitleStatus` | PropertyTitle | Wrong status for the requested operation |
| `"not funded"` | LeaseEscrow | `activate`/`cancel` on non-funded escrow |
| `"not active"` | LeaseEscrow | `releaseDeposit`/`refundDeposit` on non-active escrow |
| `"token not allowed"` | LeaseEscrow | Token not in allowlist |
| `"zero party"` | LeaseEscrow | Null landlord or tenant address |
