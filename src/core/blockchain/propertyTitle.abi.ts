// ABI for the PropertyTitle ERC-721 contract. The contract itself lives in the
// separate `real-estate-contracts` Hardhat repo; this is the minimal interface
// the backend needs to mint and read digital property titles. It is parity-
// matched with that repo's compiled ABI (`npm run export-abi` →
// abi/PropertyTitle.json) and docs/contracts/PropertyTitle.sol.
export const PROPERTY_TITLE_ABI = [
  "function mintTitle(address to, string listingId, bytes32 documentHash) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function documentHashOf(uint256 tokenId) view returns (bytes32)",
  "function listingIdOf(uint256 tokenId) view returns (string)",
  "function tokenIdOfListing(string listingId) view returns (uint256)",
  "function titleStatusOf(uint256 tokenId) view returns (uint8)",
  "event TitleMinted(uint256 indexed tokenId, address indexed to, string listingId, bytes32 documentHash)",
  "event TitleStatusChanged(uint256 indexed tokenId, uint8 indexed status, string reason)",
] as const;
