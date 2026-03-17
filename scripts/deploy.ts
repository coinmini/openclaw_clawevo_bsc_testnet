import { ethers, upgrades } from "hardhat";

/**
 * Pikemon 全合约部署脚本
 *
 * 部署 18 个合约（4 阶段按依赖顺序）+ 权限配置
 *
 * 使用方法：
 *   npx hardhat run scripts/deploy.ts --network bscTestnet
 *   npx hardhat run scripts/deploy.ts --network localhost    # 本地测试
 */

interface DeployedAddresses {
  gameConfig: string;
  randomBlockDelay: string;
  binanceVRFConsumer: string;
  lingshi: string;
  treasury: string;
  register: string;
  cultivation: string;
  hunt: string;
  treasure: string;
  caveHeaven: string;
  equipment: string;
  beast: string;
  sect: string;
  tao: string;
  market: string;
  battle: string;
  secretRealm: string;
  pill: string;
  alchemy: string;
  paymaster: string;
  gameAccountFactory: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const devWallet = process.env.DEV_WALLET || deployer.address;
  const foundationWallet = process.env.FOUNDATION_WALLET || deployer.address;
  console.log("Dev wallet:", devWallet);
  console.log("Foundation wallet:", foundationWallet);
  console.log("---");

  const addresses = {} as DeployedAddresses;

  // ========== Phase 1: 无依赖 ==========
  console.log("\n=== Phase 1: 无依赖合约 ===");

  // GameConfig (UUPS Proxy)
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfigProxy = await upgrades.deployProxy(GameConfig, [deployer.address], {
    kind: "uups",
  });
  await gameConfigProxy.waitForDeployment();
  addresses.gameConfig = await gameConfigProxy.getAddress();
  console.log("GameConfig (proxy):", addresses.gameConfig);

  // RandomBlockDelay（无依赖，Layer 1 随机数）
  const RandomBlockDelay = await ethers.getContractFactory("RandomBlockDelay");
  const randomBlockDelay = await RandomBlockDelay.deploy(deployer.address);
  await randomBlockDelay.waitForDeployment();
  addresses.randomBlockDelay = await randomBlockDelay.getAddress();
  console.log("RandomBlockDelay:", addresses.randomBlockDelay);

  // BinanceVRFConsumer（Layer 0 VRF 随机数 — Binance Oracle VRF）
  const VRF_COORDINATOR = process.env.VRF_COORDINATOR || "0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053";
  const VRF_KEY_HASH = process.env.VRF_KEY_HASH || "0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80";
  const VRF_SUB_ID = process.env.VRF_SUBSCRIPTION_ID || "0";
  const BinanceVRFConsumer = await ethers.getContractFactory("BinanceVRFConsumer");
  const vrfConsumer = await BinanceVRFConsumer.deploy(
    VRF_COORDINATOR,
    deployer.address,
    VRF_KEY_HASH,
    BigInt(VRF_SUB_ID),
    3,
    200_000,
  );
  await vrfConsumer.waitForDeployment();
  addresses.binanceVRFConsumer = await vrfConsumer.getAddress();
  console.log("BinanceVRFConsumer:", addresses.binanceVRFConsumer);

  // Paymaster（依赖 EntryPoint）
  const ENTRY_POINT = process.env.ENTRY_POINT || "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // ERC-4337 v0.7
  const Paymaster = await ethers.getContractFactory("Paymaster");
  const paymaster = await Paymaster.deploy(ENTRY_POINT, deployer.address);
  await paymaster.waitForDeployment();
  addresses.paymaster = await paymaster.getAddress();
  console.log("Paymaster:", addresses.paymaster);

  // ========== Phase 2: 依赖 GameConfig ==========
  console.log("\n=== Phase 2: 依赖 GameConfig ===");

  const LingShi = await ethers.getContractFactory("LingShi");
  const lingshi = await LingShi.deploy(deployer.address);
  await lingshi.waitForDeployment();
  addresses.lingshi = await lingshi.getAddress();
  console.log("LingShi:", addresses.lingshi);

  // ========== Phase 3: 依赖 LingShi + GameConfig ==========
  console.log("\n=== Phase 3: 依赖 LingShi + GameConfig ===");

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(
    addresses.lingshi,
    addresses.gameConfig,
    devWallet,
    foundationWallet,
    deployer.address,
  );
  await treasury.waitForDeployment();
  addresses.treasury = await treasury.getAddress();
  console.log("Treasury:", addresses.treasury);

  const Register = await ethers.getContractFactory("Register");
  const register = await Register.deploy(addresses.lingshi, addresses.gameConfig);
  await register.waitForDeployment();
  addresses.register = await register.getAddress();
  console.log("Register:", addresses.register);

  // ========== Phase 4: 活动合约 ==========
  console.log("\n=== Phase 4: 活动合约 ===");

  // Pill 无依赖，先部署（Cultivation/CaveHeaven/Treasure/Hunt/SecretRealm/Alchemy 都需要）
  const Pill = await ethers.getContractFactory("Pill");
  const pill = await Pill.deploy(deployer.address);
  await pill.waitForDeployment();
  addresses.pill = await pill.getAddress();
  console.log("Pill:", addresses.pill);

  const Cultivation = await ethers.getContractFactory("Cultivation");
  const cultivation = await Cultivation.deploy(
    addresses.lingshi,
    addresses.gameConfig,
    addresses.treasury,
    addresses.pill,
    addresses.register,
  );
  await cultivation.waitForDeployment();
  addresses.cultivation = await cultivation.getAddress();
  console.log("Cultivation:", addresses.cultivation);

  const CaveHeaven = await ethers.getContractFactory("CaveHeaven");
  const caveHeaven = await CaveHeaven.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
    addresses.pill,
  );
  await caveHeaven.waitForDeployment();
  addresses.caveHeaven = await caveHeaven.getAddress();
  console.log("CaveHeaven:", addresses.caveHeaven);

  const Equipment = await ethers.getContractFactory("Equipment");
  const equipment = await Equipment.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
  );
  await equipment.waitForDeployment();
  addresses.equipment = await equipment.getAddress();
  console.log("Equipment:", addresses.equipment);

  const Treasure = await ethers.getContractFactory("Treasure");
  const treasure = await Treasure.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
    addresses.equipment,
    addresses.pill,
  );
  await treasure.waitForDeployment();
  addresses.treasure = await treasure.getAddress();
  console.log("Treasure:", addresses.treasure);

  const Beast = await ethers.getContractFactory("Beast");
  const beast = await Beast.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
  );
  await beast.waitForDeployment();
  addresses.beast = await beast.getAddress();
  console.log("Beast:", addresses.beast);

  const Sect = await ethers.getContractFactory("Sect");
  const sect = await Sect.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
  );
  await sect.waitForDeployment();
  addresses.sect = await sect.getAddress();
  console.log("Sect:", addresses.sect);

  const Tao = await ethers.getContractFactory("Tao");
  const tao = await Tao.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
  );
  await tao.waitForDeployment();
  addresses.tao = await tao.getAddress();
  console.log("Tao:", addresses.tao);

  const Market = await ethers.getContractFactory("Market");
  const market = await Market.deploy(addresses.lingshi, addresses.treasury);
  await market.waitForDeployment();
  addresses.market = await market.getAddress();
  console.log("Market:", addresses.market);

  const Battle = await ethers.getContractFactory("Battle");
  const battle = await Battle.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
    addresses.gameConfig,
    addresses.equipment,
    addresses.beast,
  );
  await battle.waitForDeployment();
  addresses.battle = await battle.getAddress();
  console.log("Battle:", addresses.battle);

  const Hunt = await ethers.getContractFactory("Hunt");
  const hunt = await Hunt.deploy(
    addresses.lingshi,
    addresses.gameConfig,
    addresses.treasury,
    addresses.register,
    addresses.equipment,
    addresses.pill,
    addresses.beast,
    addresses.tao,
  );
  await hunt.waitForDeployment();
  addresses.hunt = await hunt.getAddress();
  console.log("Hunt:", addresses.hunt);

  const SecretRealm = await ethers.getContractFactory("SecretRealm");
  const secretRealm = await SecretRealm.deploy(
    addresses.lingshi,
    addresses.treasury,
    addresses.register,
    addresses.gameConfig,
    addresses.equipment,
    addresses.beast,
    addresses.pill,
  );
  await secretRealm.waitForDeployment();
  addresses.secretRealm = await secretRealm.getAddress();
  console.log("SecretRealm:", addresses.secretRealm);

  const Alchemy = await ethers.getContractFactory("Alchemy");
  const alchemy = await Alchemy.deploy(
    addresses.lingshi,
    addresses.pill,
    addresses.treasury,
    addresses.equipment,
    addresses.register,
  );
  await alchemy.waitForDeployment();
  addresses.alchemy = await alchemy.getAddress();
  console.log("Alchemy:", addresses.alchemy);

  // GameAccountFactory（依赖 EntryPoint, Register, LingShi）
  const migrationRecipient = process.env.MIGRATION_RECIPIENT || deployer.address;
  const Factory = await ethers.getContractFactory("GameAccountFactory");
  const gameAccountFactory = await Factory.deploy(
    ENTRY_POINT,
    addresses.register,
    addresses.lingshi,
    migrationRecipient,
    deployer.address,
  );
  await gameAccountFactory.waitForDeployment();
  addresses.gameAccountFactory = await gameAccountFactory.getAddress();
  console.log("GameAccountFactory:", addresses.gameAccountFactory);

  // ========== 权限配置 ==========
  console.log("\n=== 权限配置 ===");

  const lingshiContract = await ethers.getContractAt("LingShi", addresses.lingshi);
  const treasuryContract = await ethers.getContractAt("Treasury", addresses.treasury);
  const registerContract = await ethers.getContractAt("Register", addresses.register);
  const caveHeavenContract = await ethers.getContractAt("CaveHeaven", addresses.caveHeaven);
  const marketContract = await ethers.getContractAt("Market", addresses.market);

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  // LingShi — MINTER_ROLE
  const minters = [
    { name: "Register", addr: addresses.register },
    { name: "Cultivation", addr: addresses.cultivation },
    { name: "Hunt", addr: addresses.hunt },
    { name: "Treasure", addr: addresses.treasure },
    { name: "Equipment", addr: addresses.equipment },
    { name: "Sect", addr: addresses.sect },
    { name: "SecretRealm", addr: addresses.secretRealm },
  ];

  for (const { name, addr } of minters) {
    await (await lingshiContract.grantRole(MINTER_ROLE, addr)).wait();
    console.log(`LingShi.grantRole(MINTER, ${name})`);
  }

  // LingShi — BURNER_ROLE
  await (await lingshiContract.grantRole(BURNER_ROLE, addresses.treasury)).wait();
  console.log("LingShi.grantRole(BURNER, Treasury)");

  // Treasury — setAuthorizedCaller
  const treasuryCallers = [
    { name: "Cultivation", addr: addresses.cultivation },
    { name: "Hunt", addr: addresses.hunt },
    { name: "Treasure", addr: addresses.treasure },
    { name: "Equipment", addr: addresses.equipment },
    { name: "Beast", addr: addresses.beast },
    { name: "Battle", addr: addresses.battle },
    { name: "CaveHeaven", addr: addresses.caveHeaven },
    { name: "Tao", addr: addresses.tao },
    { name: "Sect", addr: addresses.sect },
    { name: "Market", addr: addresses.market },
    { name: "SecretRealm", addr: addresses.secretRealm },
    { name: "Alchemy", addr: addresses.alchemy },
  ];

  for (const { name, addr } of treasuryCallers) {
    await (await treasuryContract.setAuthorizedCaller(addr, true)).wait();
    console.log(`Treasury.setAuthorizedCaller(${name})`);
  }

  // Pill — MINTER_ROLE（允许铸造/销毁丹药）
  const pillContract = await ethers.getContractAt("Pill", addresses.pill);
  const PILL_MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const pillMinters = [
    { name: "Alchemy", addr: addresses.alchemy },
    { name: "CaveHeaven", addr: addresses.caveHeaven },
    { name: "Hunt", addr: addresses.hunt },
    { name: "SecretRealm", addr: addresses.secretRealm },
    { name: "Treasure", addr: addresses.treasure },
    { name: "Cultivation", addr: addresses.cultivation },
  ];
  for (const { name, addr } of pillMinters) {
    await (await pillContract.grantRole(PILL_MINTER_ROLE, addr)).wait();
    console.log(`Pill.grantRole(MINTER, ${name})`);
  }

  // Register — setAuthorizedUpdater
  await (await registerContract.setAuthorizedUpdater(addresses.cultivation, true)).wait();
  console.log("Register.setAuthorizedUpdater(Cultivation)");

  // CaveHeaven — setAuthorizedCaller
  await (await caveHeavenContract.setAuthorizedCaller(addresses.cultivation, true)).wait();
  console.log("CaveHeaven.setAuthorizedCaller(Cultivation)");

  // Equipment — GAME_CONTRACT_ROLE（允许 Hunt/Treasure 铸造装备）
  const equipmentContract = await ethers.getContractAt("Equipment", addresses.equipment);
  const GAME_CONTRACT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GAME_CONTRACT_ROLE"));
  await (await equipmentContract.grantRole(GAME_CONTRACT_ROLE, addresses.hunt)).wait();
  console.log("Equipment.grantRole(GAME_CONTRACT_ROLE, Hunt)");
  await (await equipmentContract.grantRole(GAME_CONTRACT_ROLE, addresses.treasure)).wait();
  console.log("Equipment.grantRole(GAME_CONTRACT_ROLE, Treasure)");

  // Market — setAllowedToken
  await (await marketContract.setAllowedToken(addresses.equipment, true)).wait();
  console.log("Market.setAllowedToken(Equipment)");
  await (await marketContract.setAllowedToken(addresses.beast, true)).wait();
  console.log("Market.setAllowedToken(Beast)");

  // Paymaster — setWhitelistedTarget（所有游戏合约）
  const paymasterContract = await ethers.getContractAt("Paymaster", addresses.paymaster);
  const paymasterTargets = [
    { name: "Register", addr: addresses.register },
    { name: "Cultivation", addr: addresses.cultivation },
    { name: "Hunt", addr: addresses.hunt },
    { name: "Treasure", addr: addresses.treasure },
    { name: "CaveHeaven", addr: addresses.caveHeaven },
    { name: "Equipment", addr: addresses.equipment },
    { name: "Beast", addr: addresses.beast },
    { name: "Sect", addr: addresses.sect },
    { name: "Tao", addr: addresses.tao },
    { name: "Market", addr: addresses.market },
    { name: "Battle", addr: addresses.battle },
    { name: "SecretRealm", addr: addresses.secretRealm },
    { name: "Alchemy", addr: addresses.alchemy },
  ];

  for (const { name, addr } of paymasterTargets) {
    await (await paymasterContract.setWhitelistedTarget(addr, true)).wait();
    console.log(`Paymaster.setWhitelistedTarget(${name})`);
  }

  // ========== 输出地址汇总 ==========
  console.log("\n=== 部署完成 ===\n");
  console.log(JSON.stringify(addresses, null, 2));

  // 写入地址文件供后续使用
  const fs = await import("fs");
  const path = await import("path");
  const network = (await ethers.provider.getNetwork()).name;
  const outputPath = `deployments/${network}.json`;

  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved to ${outputPath}`);

  // ========== 自动导出 ABI ==========
  console.log("\n=== 导出 ABI ===");

  const CONTRACTS_TO_EXPORT = [
    "Register", "LingShi", "GameConfig", "Treasury", "Cultivation",
    "Hunt", "Treasure", "CaveHeaven", "Equipment", "Beast",
    "Sect", "Tao", "Battle", "SecretRealm", "Market",
    "RandomBlockDelay", "BinanceVRFConsumer",
    "Paymaster", "GameAccountFactory", "GameAccount",
    "Pill", "Alchemy",
  ];

  const abisDir = path.resolve(__dirname, "../abis");
  fs.mkdirSync(abisDir, { recursive: true });

  let abiCount = 0;
  for (const name of CONTRACTS_TO_EXPORT) {
    const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
    if (!fs.existsSync(artifactPath)) continue;

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    fs.writeFileSync(path.join(abisDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2));
    abiCount++;
  }
  console.log(`Exported ${abiCount} ABIs to abis/`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
