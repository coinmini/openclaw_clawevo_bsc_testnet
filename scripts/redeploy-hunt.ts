import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Hunt 合约重新部署脚本
 *
 * Hunt.sol 使用 constant 定义冷却和掉落表，无法通过代理升级修改。
 * 本脚本：部署新 Hunt → 授权新合约 → 撤销旧合约权限 → 更新地址文件。
 *
 * 使用方法：
 *   npx hardhat run scripts/redeploy-hunt.ts --network bscTestnet
 */

async function main() {
  const deploymentsPath = path.resolve(__dirname, "../deployments/bscTestnet.json");
  const raw = fs.readFileSync(deploymentsPath, "utf-8");
  const addresses = JSON.parse(raw) as Record<string, string>;

  const oldHunt = addresses.hunt;
  console.log("旧 Hunt 地址:", oldHunt);

  // ========== 1. 部署新 Hunt ==========
  console.log("\n=== 部署新 Hunt ===");
  const Hunt = await ethers.getContractFactory("Hunt");
  const hunt = await Hunt.deploy(
    addresses.lingshi,
    addresses.gameConfig,
    addresses.treasury,
    addresses.register,
    addresses.equipment,
  );
  await hunt.waitForDeployment();
  const newHunt = await hunt.getAddress();
  console.log("新 Hunt 地址:", newHunt);

  // ========== 2. 授权新 Hunt ==========
  console.log("\n=== 授权新 Hunt ===");

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GAME_CONTRACT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GAME_CONTRACT_ROLE"));

  const lingshi = await ethers.getContractAt("LingShi", addresses.lingshi);
  await (await lingshi.grantRole(MINTER_ROLE, newHunt)).wait();
  console.log("LingShi.grantRole(MINTER_ROLE, newHunt)");

  const treasury = await ethers.getContractAt("Treasury", addresses.treasury);
  await (await treasury.setAuthorizedCaller(newHunt, true)).wait();
  console.log("Treasury.setAuthorizedCaller(newHunt, true)");

  const equipment = await ethers.getContractAt("Equipment", addresses.equipment);
  await (await equipment.grantRole(GAME_CONTRACT_ROLE, newHunt)).wait();
  console.log("Equipment.grantRole(GAME_CONTRACT_ROLE, newHunt)");

  // ========== 3. 撤销旧 Hunt 权限 ==========
  console.log("\n=== 撤销旧 Hunt 权限 ===");

  await (await lingshi.revokeRole(MINTER_ROLE, oldHunt)).wait();
  console.log("LingShi.revokeRole(MINTER_ROLE, oldHunt)");

  await (await treasury.setAuthorizedCaller(oldHunt, false)).wait();
  console.log("Treasury.setAuthorizedCaller(oldHunt, false)");

  await (await equipment.revokeRole(GAME_CONTRACT_ROLE, oldHunt)).wait();
  console.log("Equipment.revokeRole(GAME_CONTRACT_ROLE, oldHunt)");

  // ========== 4. 更新地址文件 ==========
  console.log("\n=== 更新地址文件 ===");
  const updated = { ...addresses, hunt: newHunt };
  fs.writeFileSync(deploymentsPath, JSON.stringify(updated, null, 2) + "\n");
  console.log("已更新 deployments/bscTestnet.json");

  // ========== 5. 输出验证命令 ==========
  console.log("\n=== BSCScan 验证命令 ===");
  console.log(
    `npx hardhat verify --network bscTestnet ${newHunt} ` +
    `${addresses.lingshi} ${addresses.gameConfig} ${addresses.treasury} ` +
    `${addresses.register} ${addresses.equipment}`
  );

  console.log("\n=== 完成 ===");
  console.log(`旧 Hunt: ${oldHunt}`);
  console.log(`新 Hunt: ${newHunt}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
