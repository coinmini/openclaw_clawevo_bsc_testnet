import { ethers } from "hardhat";

/**
 * 开发者环境初始化 — 给测试钱包充值灵石 + 提升境界
 *
 * 操作:
 *   1. 给 deployer 授予 LingShi MINTER_ROLE
 *   2. Mint 100,000 LS 给 deployer
 *   3. 给 deployer 授权为 Register updater
 *   4. 提升 deployer 境界到 化神 (realm=4)
 *
 * 使用:
 *   npx hardhat run scripts/dev-setup.ts --network bscTestnet
 */

const CONTRACTS = {
  Register: "0xFEceDB3796DA00F43B3C8189007182607240f532",
};

const DEV_LS_AMOUNT = ethers.parseEther("100000"); // 10万灵石
const TARGET_REALM = 4; // 化神

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const register = await ethers.getContractAt("Register", CONTRACTS.Register);
  const lingshiAddr = await register.lingshi();
  const lingshi = await ethers.getContractAt("LingShi", lingshiAddr);
  console.log("LingShi:", lingshiAddr);

  // 确认是 admin
  const ADMIN_ROLE = await lingshi.DEFAULT_ADMIN_ROLE();
  const isAdmin = await lingshi.hasRole(ADMIN_ROLE, deployer.address);
  console.log("Is LingShi admin:", isAdmin);
  if (!isAdmin) {
    console.error("Deployer is not LingShi admin, cannot proceed");
    return;
  }

  // ── 1. Grant MINTER_ROLE to deployer ──
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const hasMinter = await lingshi.hasRole(MINTER_ROLE, deployer.address);
  if (!hasMinter) {
    console.log("\n=== Granting MINTER_ROLE to deployer ===");
    const tx = await lingshi.grantRole(MINTER_ROLE, deployer.address);
    await tx.wait();
    console.log("Done. TX:", tx.hash);
  } else {
    console.log("Already has MINTER_ROLE");
  }

  // ── 2. Mint LS ──
  const balBefore = await lingshi.balanceOf(deployer.address);
  console.log("\nLS Balance before:", ethers.formatEther(balBefore));

  if (balBefore < DEV_LS_AMOUNT) {
    const mintAmount = DEV_LS_AMOUNT - balBefore;
    console.log("Minting", ethers.formatEther(mintAmount), "LS...");
    const tx = await lingshi.mint(deployer.address, mintAmount);
    await tx.wait();
    console.log("Done. TX:", tx.hash);
  } else {
    console.log("Already has enough LS, skipping mint");
  }

  const balAfter = await lingshi.balanceOf(deployer.address);
  console.log("LS Balance after:", ethers.formatEther(balAfter));

  // ── 3. Authorize deployer as Register updater ──
  const isRegistered = await register.isRegistered(deployer.address);
  if (!isRegistered) {
    console.error("\nPlayer not registered! Run test-register.ts first.");
    return;
  }

  console.log("\n=== Setting deployer as Register authorized updater ===");
  const isUpdater = await register.authorizedUpdaters(deployer.address);
  if (!isUpdater) {
    const tx = await register.setAuthorizedUpdater(deployer.address, true);
    await tx.wait();
    console.log("Done. TX:", tx.hash);
  } else {
    console.log("Already authorized");
  }

  // ── 4. Update realm to 化神 (4) ──
  const cultivator = await register.getCultivator(deployer.address);
  console.log("\nCurrent realm:", cultivator.realm);

  if (cultivator.realm < TARGET_REALM) {
    console.log("Upgrading realm to", TARGET_REALM, "(化神)...");
    const tx = await register.updateRealm(deployer.address, TARGET_REALM);
    await tx.wait();
    console.log("Done. TX:", tx.hash);
  } else {
    console.log("Already at target realm");
  }

  // ── 验证 ──
  const final = await register.getCultivator(deployer.address);
  const finalBal = await lingshi.balanceOf(deployer.address);
  console.log("\n=== Final State ===");
  console.log("Realm:", final.realm, "(化神 = 4)");
  console.log("LS:", ethers.formatEther(finalBal));
  console.log("Ready for all contract tests!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
