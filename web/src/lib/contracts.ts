/**
 * Contract addresses (BSC Testnet) and minimal ABI fragments for wagmi reads.
 * Addresses sourced from deployments/bscTestnet.json.
 * ABIs are inline `as const` for wagmi type inference + tree-shaking.
 */

import { type Address } from "viem";

// ── Contract addresses ──────────────────────────────────────

export const CONTRACTS = {
  register: "0x2E4B508fD337368Af31080762075a045e0589D6A" as Address,
  lingshi: "0x308B798503289E488feFc48Dda4547A17818EcDb" as Address,
  sect: "0xfE226C4638B7b3DFD79b7db747f43cE57e2C394E" as Address,
  tao: "0xaAa50163EeCae1d92Eb99441F4d02B97Ce81eA66" as Address,
  beast: "0xb093cE9A022700b4760F5443Ae6Afe34BD1DCbBD" as Address,
  cultivation: "0x9a0B33Bcf5bB2e81c36A522069FB5f5054c208eb" as Address,
  market: "0xb99160e82535d43f77Bf05Ad007e7d40F2DbB968" as Address,
  pill: "0x415A1b80e92130F621899EC51BcB22110d96009f" as Address,
  equipment: "0x5743929215b06e25Bd063fA23B0a095A5404EA74" as Address,
  secretRealm: "0xa489F78Cd96a3b892A60FDa5be015724b97714D2" as Address,
  battle: "0x0E4A2F2c9100899c8dd594F22cE0F245fBaA4A14" as Address,
} as const;

// ── Register ABI (getCultivator + isRegistered) ─────────────

export const REGISTER_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getCultivator",
    outputs: [
      {
        components: [
          { name: "origin", type: "uint8" },
          { name: "element", type: "uint8" },
          { name: "faction", type: "uint8" },
          { name: "realm", type: "uint8" },
          { name: "subRealm", type: "uint8" },
          { name: "attack", type: "uint256" },
          { name: "defense", type: "uint256" },
          { name: "perception", type: "uint256" },
          { name: "wisdom", type: "uint256" },
          { name: "heart", type: "uint256" },
          { name: "fortune", type: "uint256" },
          { name: "registeredAt", type: "uint256" },
          { name: "name", type: "string" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "newName", type: "string" }],
    name: "setName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ── LingShi ABI (balanceOf) ─────────────────────────────────

export const LINGSHI_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Sect ABI (getMembership + getSectInfo) ───────────────────

export const SECT_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getMembership",
    outputs: [
      {
        components: [
          { name: "sectId", type: "uint256" },
          { name: "rank", type: "uint8" },
          { name: "contribution", type: "uint256" },
          { name: "joinedAt", type: "uint256" },
          { name: "lastClaimedDay", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "sectId", type: "uint256" }],
    name: "getSectInfo",
    outputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "master", type: "address" },
          { name: "level", type: "uint8" },
          { name: "totalPoints", type: "uint256" },
          { name: "treasury", type: "uint256" },
          { name: "memberCount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Tao ABI (getPartner) ────────────────────────────────────

export const TAO_ABI = [
  {
    inputs: [{ name: "cultivator", type: "address" }],
    name: "getPartner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Cultivation ABI (getSession) ─────────────────────────────

export const CULTIVATION_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getSession",
    outputs: [
      {
        components: [
          { name: "startTime", type: "uint256" },
          { name: "active", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Market ABI ───────────────────────────────────────────────

export const MARKET_ABI = [
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "getOrder",
    outputs: [
      {
        components: [
          { name: "seller", type: "address" },
          { name: "tokenContract", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "isERC1155", type: "bool" },
          { name: "amount", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getActiveOrderCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    name: "createOrder",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    name: "createOrder1155",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "cancelOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "fillOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "floorPrices",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Equipment ABI ────────────────────────────────────────────

export const EQUIPMENT_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getEquipmentData",
    outputs: [
      {
        components: [
          { name: "eType", type: "uint8" },
          { name: "quality", type: "uint8" },
          { name: "bonusBP", type: "uint16" },
          { name: "enhanceLevel", type: "uint8" },
          { name: "elementAffinity", type: "uint8" },
          { name: "originAffinity", type: "uint8" },
          { name: "factionAffinity", type: "uint8" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "equip",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "slot", type: "uint8" }],
    name: "unequip",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "enhance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "materialIds", type: "uint256[]" }],
    name: "startUpgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "finishUpgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "decompose",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "player", type: "address" },
      { name: "slot", type: "uint8" },
    ],
    name: "getEquipped",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getSpiritMaterials",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── LingShi ABI (approve for market spending) ────────────────

export const LINGSHI_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Beast ABI (getEquippedBeast + getBeastInfo + speciesNames)

export const BEAST_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getEquippedBeast",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getBeastInfo",
    outputs: [
      {
        components: [
          { name: "star", type: "uint8" },
          { name: "element", type: "uint8" },
          { name: "powerRate", type: "uint16" },
          { name: "level", type: "uint8" },
          { name: "speciesId", type: "uint8" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "speciesNames",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── SecretRealm ABI ─────────────────────────────────────────

export const SECRET_REALM_ABI = [
  {
    inputs: [{ name: "realmId", type: "uint8" }],
    name: "enterSolo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "realmId", type: "uint8" }],
    name: "createParty",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "partyId", type: "uint256" }],
    name: "joinParty",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "partyId", type: "uint256" }],
    name: "enterAsParty",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "challengeLayer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "claimLayerDrop",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getProgress",
    outputs: [
      {
        components: [
          { name: "realmId", type: "uint8" },
          { name: "currentLayer", type: "uint8" },
          { name: "blockNumber", type: "uint256" },
          { name: "dropClaimed", type: "bool" },
          { name: "active", type: "bool" },
          { name: "isSolo", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "partyId", type: "uint256" }],
    name: "getParty",
    outputs: [
      {
        components: [
          { name: "leader", type: "address" },
          { name: "members", type: "address[3]" },
          { name: "memberCount", type: "uint8" },
          { name: "realmId", type: "uint8" },
          { name: "entered", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "secretRealmFee",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "", type: "uint8" },
      { name: "", type: "uint8" },
    ],
    name: "realmLayers",
    outputs: [
      { name: "monsterAtk", type: "uint256" },
      { name: "monsterDef", type: "uint256" },
      { name: "reward", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "realmElements",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Battle ABI ──────────────────────────────────────────────

export const BATTLE_ABI = [
  {
    inputs: [{ name: "wager", type: "uint256" }],
    name: "createChallenge",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "challengeId", type: "uint256" }],
    name: "cancelChallenge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "challengeId", type: "uint256" }],
    name: "acceptChallenge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "challengeId", type: "uint256" }],
    name: "getChallenge",
    outputs: [
      {
        components: [
          { name: "creator", type: "address" },
          { name: "wager", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getActiveChallengeCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minBattleWager",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "challengeDuration",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "battleFeeBP",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Pill ABI (ERC-1155 丹药) ────────────────────────────────

export const PILL_ABI = [
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getAllPillBalances",
    outputs: [{ name: "", type: "uint256[8]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
