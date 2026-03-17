/**
 * tune-economy.ts — 调整打野/挖宝/秘境经济参数
 *
 * 配合 speedup-game.ts 的加速节奏，让打野比闭关赚钱更快，鼓励社交互动。
 *
 * 用法：npx hardhat run scripts/tune-economy.ts --network bscTestnet
 */

import { ethers } from "hardhat";
import type { BaseContract } from "ethers";

const ADDRESSES = {
  hunt:        "0x020A651feB246FFe4E133b9bb1B060B88Bf1a0F0",
  treasure:    "0x9E1cc1A3f993F745F1Acb57a117Ad2D22f9f7b05",
  secretRealm: "0xAAEe8a9EF71674dcec9CEE5C76753CFADf95F600",
} as const;

const HUNT_ABI = [
  "function setMonsterRegion(uint8 regionId, uint8 difficulty, uint8 element, uint256 monsterAtk, uint256 monsterDef, uint256 reward, uint256 roadFee) external",
  "function setDropRewards(uint256[6] newRewards) external",
  "function setPillDropMinDifficulty(uint8 newValue) external",
  "function setPillDropMinQuality(uint8 newValue) external",
  "function owner() view returns (address)",
];

const TREASURE_ABI = [
  "function setDropRewards(uint256[6] newRewards) external",
  "function owner() view returns (address)",
];

const SECRET_REALM_ABI = [
  "function setSecretRealmFee(uint256 newFee) external",
  "function owner() view returns (address)",
];

// Monster regions: [difficulty, element, atk, def, reward(LS), roadFee(LS)]
const HUNT_REGIONS: readonly [number, number, number, number, number, number][] = [
  [1, 1, 150,  100,  40,  5],   // 0: 碧翠原野, 木
  [2, 2, 350,  250,  50,  6],   // 1: 临海港口, 水
  [2, 3, 400,  300,  60,  6],   // 2: 火焰岛屿, 火
  [3, 2, 800,  600,  80,  8],   // 3: 冰封高峰, 水
  [4, 0, 1800, 1200, 160, 10],  // 4: 雷霆废墟, 金
  [4, 1, 2000, 1500, 160, 12],  // 5: 幽影密林, 木
];

const REGION_NAMES = ["碧翠原野", "临海港口", "火焰岛屿", "冰封高峰", "雷霆废墟", "幽影密林"];

// Drop rewards: [NONE, WHITE, GREEN, BLUE, PURPLE, VEIN]
const DROP_REWARDS = [0, 10, 30, 100, 200, 300]; // LS

async function sendTx(contract: BaseContract, method: string, args: unknown[], label: string) {
  const tx = await (contract as Record<string, (...a: unknown[]) => Promise<{ wait: () => Promise<unknown> }>>)[method](...args);
  await tx.wait();
  console.log(`  ✓ ${label}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const hunt        = new ethers.Contract(ADDRESSES.hunt, HUNT_ABI, deployer);
  const treasure    = new ethers.Contract(ADDRESSES.treasure, TREASURE_ABI, deployer);
  const secretRealm = new ethers.Contract(ADDRESSES.secretRealm, SECRET_REALM_ABI, deployer);

  // ── 1. Hunt regions（路费降半，奖励翻倍）──
  console.log("\n=== 调整打野区域 ===");
  for (let i = 0; i < HUNT_REGIONS.length; i++) {
    const [diff, elem, atk, def, reward, fee] = HUNT_REGIONS[i];
    await sendTx(hunt, "setMonsterRegion", [
      i, diff, elem, atk, def,
      ethers.parseEther(String(reward)),
      ethers.parseEther(String(fee)),
    ], `${REGION_NAMES[i]}: 奖励${reward} LS, 路费${fee} LS`);
  }

  // ── 2. Hunt drop rewards（翻倍）──
  console.log("\n=== 调整打野掉落奖励 ===");
  const huntDrops = DROP_REWARDS.map(v => ethers.parseEther(String(v)));
  await sendTx(hunt, "setDropRewards", [huntDrops], `掉落奖励: ${DROP_REWARDS.join("/")} LS`);

  // ── 3. Hunt pill drop 门槛降低 ──
  console.log("\n=== 降低丹药掉落门槛 ===");
  await sendTx(hunt, "setPillDropMinDifficulty", [2], "丹药掉落最低难度: 2 (原3)");
  await sendTx(hunt, "setPillDropMinQuality", [2], "丹药掉落最低品质: GREEN (原BLUE)");

  // ── 4. Treasure drop rewards（同步）──
  console.log("\n=== 调整挖宝掉落奖励 ===");
  const treasureDrops = DROP_REWARDS.map(v => ethers.parseEther(String(v)));
  await sendTx(treasure, "setDropRewards", [treasureDrops], `掉落奖励: ${DROP_REWARDS.join("/")} LS`);

  // ── 5. SecretRealm fee ──
  console.log("\n=== 调整秘境入场费 ===");
  await sendTx(secretRealm, "setSecretRealmFee", [ethers.parseEther("30")], "秘境入场费: 30 LS (原100)");

  console.log("\n✅ 经济参数调整完成！");
  console.log("\n打野净收入（胜利时）:");
  for (let i = 0; i < HUNT_REGIONS.length; i++) {
    const [,,,,reward, fee] = HUNT_REGIONS[i];
    console.log(`  ${REGION_NAMES[i]}: +${reward - fee} LS/次`);
  }
}

main().catch(console.error);
