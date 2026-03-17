import { ethers } from "hardhat";

/**
 * 补完权限配置（部署后如果权限配置中断，用此脚本继续）
 *
 * 使用方法：
 *   npx hardhat run scripts/configure-permissions.ts --network bscTestnet
 *
 * 脚本会检查每个权限是否已设置，跳过已有的，只配置缺失的。
 */

// BSC Testnet 部署地址（2026-03-01）
const ADDRESSES = {
  gameConfig: "0x605021bE49FB6C3e327d6c1960623f2e122c7279",
  battleVerifier: "0xd53A6916239cF77Ef6E8C968e43ce92214f5a614",
  huntVerifier: "0xBD1eA45AAb351Fad4Cd9e7b9628F9718E603D0d4",
  beastCaptureVerifier: "0xfB108821d0c0d77A91c48A99BafD2b6fa1064fB6",
  realmVerifier: "0x7537023AB105076E1A79dA5fcc8e40249ADbF498",
  dualHuntVerifier: "0xcd55821C6713bd29e0E93Dd4eDAe81c6a738ACA3",
  lingshi: "0x027ae246fE9B0b766FcBD2f9c663EdED443409E3",
  groth16Verifier: "0xDdb97bA9F6B72B101f8fd98dE1ed1f3b302aD435",
  treasury: "0x6b1176A40A560BDF98Fc65516fB3a8507f2415f2",
  register: "0xaE8Ef6361b7c7dA4B6Ef35f2906FA5056Ebb1dA5",
  cultivation: "0x6498f6587694bAd7b4095Af610a0D15fC7dC2541",
  hunt: "0xd1B0231C6DBa12Ed69E135E00883C233Cb019AfF",
  treasure: "0xFA71129e3d05E34c42387159De95f21C487926b6",
  caveHeaven: "0xb228A8C1eBD42B736A922D497dF1e88f362dEB64",
  equipment: "0xb9afFE276EFD2bD6B3544da5529F62a9B62d8Db7",
  beast: "0xCc83238e282b57aDfaf9101EF3833fBe650150e0",
  sect: "0xFd864ffFFF7D54e12Cd0d3C34Dc2Af1110651994",
  tao: "0xe3C97b506f19dbafBec8780E7B1888eB0aebc719",
  market: "0x9cCAaCD2605Cfd784Cd449EFeD76a0e87fEc9d5B",
  battle: "0x526692900d0d40B791bDaF449E3FdCF3bD0F843F",
  secretRealm: "0xA683c6cACe74ef6E8701D552728f24CC285CcEA9",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
  console.log("---");

  const lingshi = await ethers.getContractAt("LingShi", ADDRESSES.lingshi);
  const treasury = await ethers.getContractAt("Treasury", ADDRESSES.treasury);
  const register = await ethers.getContractAt("Register", ADDRESSES.register);
  const caveHeaven = await ethers.getContractAt("CaveHeaven", ADDRESSES.caveHeaven);
  const market = await ethers.getContractAt("Market", ADDRESSES.market);

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  // ===== LingShi MINTER_ROLE =====
  console.log("\n=== LingShi MINTER_ROLE ===");
  const minters = [
    { name: "Register", addr: ADDRESSES.register },
    { name: "Cultivation", addr: ADDRESSES.cultivation },
    { name: "Hunt", addr: ADDRESSES.hunt },
    { name: "Treasure", addr: ADDRESSES.treasure },
    { name: "Equipment", addr: ADDRESSES.equipment },
    { name: "Sect", addr: ADDRESSES.sect },
    { name: "SecretRealm", addr: ADDRESSES.secretRealm },
  ];

  for (const { name, addr } of minters) {
    const has = await lingshi.hasRole(MINTER_ROLE, addr);
    if (has) {
      console.log(`  SKIP: ${name} (already has MINTER_ROLE)`);
    } else {
      await (await lingshi.grantRole(MINTER_ROLE, addr)).wait();
      console.log(`  ✓ LingShi.grantRole(MINTER, ${name})`);
    }
  }

  // ===== LingShi BURNER_ROLE =====
  console.log("\n=== LingShi BURNER_ROLE ===");
  const hasBurner = await lingshi.hasRole(BURNER_ROLE, ADDRESSES.treasury);
  if (hasBurner) {
    console.log("  SKIP: Treasury (already has BURNER_ROLE)");
  } else {
    await (await lingshi.grantRole(BURNER_ROLE, ADDRESSES.treasury)).wait();
    console.log("  ✓ LingShi.grantRole(BURNER, Treasury)");
  }

  // ===== Treasury setAuthorizedCaller =====
  console.log("\n=== Treasury setAuthorizedCaller ===");
  const treasuryCallers = [
    { name: "Cultivation", addr: ADDRESSES.cultivation },
    { name: "Hunt", addr: ADDRESSES.hunt },
    { name: "Treasure", addr: ADDRESSES.treasure },
    { name: "Equipment", addr: ADDRESSES.equipment },
    { name: "Beast", addr: ADDRESSES.beast },
    { name: "Battle", addr: ADDRESSES.battle },
    { name: "CaveHeaven", addr: ADDRESSES.caveHeaven },
    { name: "Tao", addr: ADDRESSES.tao },
    { name: "Sect", addr: ADDRESSES.sect },
    { name: "Market", addr: ADDRESSES.market },
    { name: "SecretRealm", addr: ADDRESSES.secretRealm },
  ];

  for (const { name, addr } of treasuryCallers) {
    const isAuthorized = await treasury.authorizedCallers(addr);
    if (isAuthorized) {
      console.log(`  SKIP: ${name} (already authorized)`);
    } else {
      await (await treasury.setAuthorizedCaller(addr, true)).wait();
      console.log(`  ✓ Treasury.setAuthorizedCaller(${name})`);
    }
  }

  // ===== Register setAuthorizedUpdater =====
  console.log("\n=== Register setAuthorizedUpdater ===");
  const isCultUpdater = await register.authorizedUpdaters(ADDRESSES.cultivation);
  if (isCultUpdater) {
    console.log("  SKIP: Cultivation (already authorized updater)");
  } else {
    await (await register.setAuthorizedUpdater(ADDRESSES.cultivation, true)).wait();
    console.log("  ✓ Register.setAuthorizedUpdater(Cultivation)");
  }

  // ===== CaveHeaven setAuthorizedCaller =====
  console.log("\n=== CaveHeaven setAuthorizedCaller ===");
  const isCultCaveCaller = await caveHeaven.authorizedCallers(ADDRESSES.cultivation);
  if (isCultCaveCaller) {
    console.log("  SKIP: Cultivation (already authorized caller)");
  } else {
    await (await caveHeaven.setAuthorizedCaller(ADDRESSES.cultivation, true)).wait();
    console.log("  ✓ CaveHeaven.setAuthorizedCaller(Cultivation)");
  }

  // ===== Market setAllowedToken =====
  console.log("\n=== Market setAllowedToken ===");
  const equipAllowed = await market.allowedTokens(ADDRESSES.equipment);
  if (equipAllowed) {
    console.log("  SKIP: Equipment (already allowed)");
  } else {
    await (await market.setAllowedToken(ADDRESSES.equipment, true)).wait();
    console.log("  ✓ Market.setAllowedToken(Equipment)");
  }

  const beastAllowed = await market.allowedTokens(ADDRESSES.beast);
  if (beastAllowed) {
    console.log("  SKIP: Beast (already allowed)");
  } else {
    await (await market.setAllowedToken(ADDRESSES.beast, true)).wait();
    console.log("  ✓ Market.setAllowedToken(Beast)");
  }

  console.log("\n=== 权限配置完成 ===");

  // 输出余额
  console.log("Remaining balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
