// ABI for the SaleEscrow contract (lives in the real-estate-contracts repo).
// Parity-matched with that repo's abi/SaleEscrow.json (`npm run export-abi`).
// NOTE: EscrowReleased carries seller (indexed); EscrowRefunded carries buyer (indexed).
export const SALE_ESCROW_ABI = [
  "function openAndFund(string saleId, address buyer, address seller, address token, uint256 amount, bytes32 termsHash) returns (uint256 escrowId)",
  "function release(uint256 escrowId)",
  "function refund(uint256 escrowId)",
  "function escrowState(uint256 escrowId) view returns (uint8)",
  "function getEscrow(uint256 escrowId) view returns (tuple(string saleId, address buyer, address seller, address token, uint256 amount, bytes32 termsHash, uint8 state))",
  "event EscrowFunded(uint256 indexed escrowId, string saleId, address indexed buyer, address indexed seller, uint256 amount)",
  "event EscrowReleased(uint256 indexed escrowId, address indexed seller, uint256 amount)",
  "event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount)",
] as const;
