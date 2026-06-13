// ABI for the PropertyTitle ERC-721 contract. The contract itself lives in the
// separate `contracts` repo (Hardhat); this is the minimal interface the
// backend needs to mint and read digital property titles. Keep in sync with
// docs/contracts/PropertyTitle.sol.
export const PROPERTY_TITLE_ABI = [
  "function mintTitle(address to, string listingId, bytes32 documentHash) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function documentHashOf(uint256 tokenId) view returns (bytes32)",
  "function listingIdOf(uint256 tokenId) view returns (string)",
  "event TitleMinted(uint256 indexed tokenId, address indexed to, string listingId, bytes32 documentHash)",
] as const;
