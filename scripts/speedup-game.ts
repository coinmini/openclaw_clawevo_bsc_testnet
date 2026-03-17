/**
 * speedup-game.ts — 调整链上游戏参数加速进程
 *
 * 目标节奏：练气→筑基 30min, 筑基→金丹 1h, 金丹→元婴 2h, 元婴→化神 4h
 * 设计理念：修炼给 exp，但丹药必须通过打野/交易获取，促进社交互动
 *
 * 用法：npx hardhat run scripts/speedup-game.ts --network chapel
 */

import { ethers } from "hardhat";
import type { BaseContract } from "ethers";

// ── 合约地址（BSC Testnet 当前部署）──
const ADDRESSES = {
  gameConfig:  "0x0f9cfc258675F2D51398F409053225d84CE4D827",
  cultivation: "0x9a0B33Bcf5bB2e81c36A522069FB5f5054c208eb",
  alchemy:     "0x1aA6a28dC1B27716cdaDE7d110fef5658b4887a1",
} as const;

// ── ABI 片段（只需 setter 函数）──

const CULTIVATION_SETTERS_ABI = [
  "function setExpPerHour(uint8 realm, uint256 newValue) external",
  "function setOutputPerHour(uint8 realm, uint256 newValue) external",
  "function setFeePerHour(uint8 realm, uint256 newValue) external",
  "function setSubRealmExpBase(uint8 realm, uint256 newValue) external",
  "function setSubRealmExpStep(uint8 realm, uint256 newValue) external",
  "function owner() view returns (address)",
  // Getters for verification
  "function expPerHour(uint256) view returns (uint256)",
  "function outputPerHour(uint256) view returns (uint256)",
  "function feePerHour(uint256) view returns (uint256)",
  "function subRealmExpBase(uint256) view returns (uint256)",
  "function subRealmExpStep(uint256) view returns (uint256)",
];

const ALCHEMY_SETTERS_ABI = [
  "function setRecipe(uint8 recipeId, uint256 lsCost, uint256 materialCount, uint256 successRateBP, uint8 realmRequired) external",
  "function owner() view returns (address)",
];

const GAMECONFIG_SETTERS_ABI = [
  "function setInitialLingShi(uint256 newValue) external",
  "function initialLingShi() view returns (uint256)",
];

// ── 新参数 ──

const EXP_PER_HOUR   = [500, 300, 200, 120, 80];      // 练气/筑基/金丹/元婴/化神
const OUTPUT_PER_HOUR = [20, 50, 100, 200, 400];       // LS/h (before ether scaling)
const FEE_PER_HOUR    = [5, 15, 30, 60, 120];          // LS/h fee
const SUB_REALM_BASE  = [15, 50, 120, 300, 600];       // exp base per sub-realm
const SUB_REALM_STEP  = [2, 8, 20, 50, 100];           // exp step per sub-realm
const INITIAL_LS      = 100;                            // 初始灵石

// 炼丹配方: [pillType, lsCost(ether), materialCount, successRateBP, realmRequired]
const RECIPES: readonly [number, number, number, number, number][] = [
  [0, 50,   2,  8000, 0],   // 筑基丹
  [1, 200,  5,  7000, 1],   // 结丹丹
  [2, 800,  10, 5500, 2],   // 凝婴丹
  [3, 2000, 20, 4000, 3],   // 化神丹
  [4, 10,   1,  9000, 0],   // 培元丹
  [5, 40,   2,  7500, 1],   // 聚灵丹
  [6, 150,  5,  6000, 2],   // 洗髓丹
  [7, 300,  8,  5000, 2],   // 护心丹
];

const REALM_NAMES = ["练气", "筑基", "金丹", "元婴", "化神"];
const PILL_NAMES  = ["筑基丹", "结丹丹", "凝婴丹", "化神丹", "培元丹", "聚灵丹", "洗髓丹", "护心丹"];

async function sendTx(contract: BaseContract, method: string, args: unknown[], label: string) {
  const tx = await (contract as Record<string, (...a: unknown[]) => Promise<{ wait: () => Promise<unknown> }>>)[method](...args);
  await tx.wait();
  console.log(`  ✓ ${label}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const cultivation = new ethers.Contract(ADDRESSES.cultivation, CULTIVATION_SETTERS_ABI, deployer);
  const alchemy     = new ethers.Contract(ADDRESSES.alchemy, ALCHEMY_SETTERS_ABI, deployer);
  const gameConfig  = new ethers.Contract(ADDRESSES.gameConfig, GAMECONFIG_SETTERS_ABI, deployer);

  // Verify ownership
  const cultOwner = await cultivation.owner();
  const alchOwner = await alchemy.owner();
  console.log("Cultivation owner:", cultOwner);
  console.log("Alchemy owner:", alchOwner);

  // ── 1. 修炼 exp ──
  console.log("\n=== 调整修炼 exp ===");
  for (let r = 0; r < 5; r++) {
    await sendTx(cultivation, "setExpPerHour", [r, EXP_PER_HOUR[r]], `expPerHour[${REALM_NAMES[r]}] = ${EXP_PER_HOUR[r]}`);
  }

  // ── 2. 灵石产出 ──
  console.log("\n=== 调整灵石产出 ===");
  for (let r = 0; r < 5; r++) {
    await sendTx(cultivation, "setOutputPerHour", [r, ethers.parseEther(String(OUTPUT_PER_HOUR[r]))], `outputPerHour[${REALM_NAMES[r]}] = ${OUTPUT_PER_HOUR[r]} LS`);
    await sendTx(cultivation, "setFeePerHour", [r, ethers.parseEther(String(FEE_PER_HOUR[r]))], `feePerHour[${REALM_NAMES[r]}] = ${FEE_PER_HOUR[r]} LS`);
  }

  // ── 3. 升重 exp ──
  console.log("\n=== 调整升重 exp 需求 ===");
  for (let r = 0; r < 5; r++) {
    await sendTx(cultivation, "setSubRealmExpBase", [r, SUB_REALM_BASE[r]], `subRealmExpBase[${REALM_NAMES[r]}] = ${SUB_REALM_BASE[r]}`);
    await sendTx(cultivation, "setSubRealmExpStep", [r, SUB_REALM_STEP[r]], `subRealmExpStep[${REALM_NAMES[r]}] = ${SUB_REALM_STEP[r]}`);
  }

  // ── 4. 炼丹配方 ──
  console.log("\n=== 调整炼丹配方 ===");
  for (const [id, lsCost, mat, rate, realm] of RECIPES) {
    await sendTx(alchemy, "setRecipe", [id, ethers.parseEther(String(lsCost)), mat, rate, realm], `${PILL_NAMES[id]}: ${lsCost} LS, ${mat} 材料, ${rate / 100}%`);
  }

  // ── 5. 初始灵石 ──
  console.log("\n=== 调整初始灵石 ===");
  await sendTx(gameConfig, "setInitialLingShi", [ethers.parseEther(String(INITIAL_LS))], `initialLingShi = ${INITIAL_LS} LS`);

  // ── 验证 ──
  console.log("\n=== 验证结果 ===");
  for (let r = 0; r < 5; r++) {
    const exp = await cultivation.expPerHour(r);
    const out = await cultivation.outputPerHour(r);
    const fee = await cultivation.feePerHour(r);
    const base = await cultivation.subRealmExpBase(r);
    const step = await cultivation.subRealmExpStep(r);
    // Calculate total exp for 9 sub-realm upgrades
    let totalExp = 0;
    for (let s = 0; s < 9; s++) totalExp += Number(base) + s * Number(step);
    const hoursToMax = totalExp / Number(exp);

    console.log(`${REALM_NAMES[r]}: exp=${exp}/h, LS=${ethers.formatEther(out)}/h(净${ethers.formatEther(out - fee)}), 升9重=${totalExp}exp(${(hoursToMax * 60).toFixed(0)}min)`);
  }

  const initialLS = await gameConfig.initialLingShi();
  console.log(`初始灵石: ${ethers.formatEther(initialLS)} LS`);

  console.log("\n✅ 游戏加速配置完成！");
}

main().catch(console.error);
