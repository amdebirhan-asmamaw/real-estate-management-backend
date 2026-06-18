// ABI for the LeaseEscrow contract (lives in the real-estate-contracts repo).
// Parity-matched with that repo's abi/LeaseEscrow.json (`npm run export-abi`).
export const LEASE_ESCROW_ABI = [
  "function openAndFund(string leaseId, address landlord, address tenant, address token, uint256 rentAmount, uint256 depositAmount, bytes32 termsHash) returns (uint256)",
  "function activate(uint256 escrowId)",
  "function cancel(uint256 escrowId)",
  "function releaseDeposit(uint256 escrowId)",
  "function refundDeposit(uint256 escrowId)",
  "function escrowState(uint256 escrowId) view returns (uint8)",
  "function getEscrow(uint256 escrowId) view returns (tuple(string leaseId, address landlord, address tenant, address token, uint256 rentAmount, uint256 depositAmount, bytes32 termsHash, uint8 state))",
  // ERC-20 token helper — read decimals for amount scaling
  "function decimals() view returns (uint8)",
  "event EscrowFunded(uint256 indexed escrowId, string leaseId, address indexed landlord, address indexed tenant, uint256 rentAmount, uint256 depositAmount)",
  "event RentReleased(uint256 indexed escrowId, address indexed landlord, uint256 amount)",
  "event EscrowRefunded(uint256 indexed escrowId, address indexed tenant, uint256 amount)",
  "event DepositReleased(uint256 indexed escrowId, address indexed landlord, uint256 amount)",
  "event DepositRefunded(uint256 indexed escrowId, address indexed tenant, uint256 amount)",
] as const;
