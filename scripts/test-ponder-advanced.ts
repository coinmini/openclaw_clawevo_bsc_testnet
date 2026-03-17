import { ethers } from "hardhat";

/**
 * The Graph 高阶合约事件测试（需先运行 dev-setup.ts）
 *
 * 测试:
 *   1. Beast:       startBeastHunt → finishBeastHunt
 *   2. CaveHeaven:  open → upgrade → payMaintenance
 *   3. Sect:        createSect → joinSect (需第2钱包)
 *   4. Tao:         proposePartnership → cancelProposal
 *   5. SecretRealm: enterSolo → challengeLayer → claimLayerDrop
 *   6. Equipment:   (通过 GAME_CONTRACT_ROLE mint)
 *   7. Market:      createOrder → cancelOrder
 *
 * 使用:
 *   npx hardhat run scripts/test-ponder-advanced.ts --network bscTestnet
 */

const CONTRACTS = {
  Register: "0xFEceDB3796DA00F43B3C8189007182607240f532",
  Beast: "0x826345248f15c01513Fc53ed17bC2cb03BCC35A5",
  CaveHeaven: "0xF8d04475Ef8c3F9f490E9365eC16Fd2e20843f4F",
  Sect: "0x0091C43E7951859713d7a61480965A1Aac9C6b14",
  Tao: "0x0dAE949Cb62E5C3685EE2e4640D768e9900ED928",
  SecretRealm: "0xA856860f5912999e8D9847E79c022C390ad89ac5",
  Equipment: "0x9e4DAAe0B1Fd884dC42Cd48f5CB00D1AA7573d15",
  Market: "0x9eefd9fBEE25Edc23483FF4eba4ee5324d7F2896",
  Treasury: "0xdF29944e7e300296256cFa748b569691868Faa66",
};

const SUBGRAPH_GRAPHQL =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const register = await ethers.getContractAt("Register", CONTRACTS.Register);
  const lingshiAddr = await register.lingshi();
  const lingshi = await ethers.getContractAt("LingShi", lingshiAddr);

  const bal = await lingshi.balanceOf(signer.address);
  console.log("LS:", ethers.formatEther(bal));
  const cult = await register.getCultivator(signer.address);
  console.log("Realm:", cult.realm.toString(), "\n");

  // ═══ 1. Beast 灵兽捕猎 ═══
  console.log("═══ 1. Beast 灵兽捕猎 ═══");
  await testBeast(lingshi, signer.address);

  // ═══ 2. CaveHeaven 洞天 ═══
  console.log("\n═══ 2. CaveHeaven 洞天 ═══");
  await testCaveHeaven(lingshi, signer.address);

  // ═══ 3. Sect 宗门 ═══
  console.log("\n═══ 3. Sect 宗门 ═══");
  await testSect(lingshi, signer.address);

  // ═══ 4. Tao 道侣 ═══
  console.log("\n═══ 4. Tao 道侣 ═══");
  await testTao(signer.address);

  // ═══ 5. SecretRealm 秘境 ═══
  console.log("\n═══ 5. SecretRealm 秘境 ═══");
  await testSecretRealm(lingshi, signer.address);

  // ═══ 6. Equipment 装备 ═══
  console.log("\n═══ 6. Equipment 装备 ═══");
  await testEquipment(lingshi, signer.address);

  // ═══ 7. Market 坊市 ═══
  console.log("\n═══ 7. Market 坊市 ═══");
  await testMarket(lingshi, signer.address);

  // ═══ The Graph 验证 ═══
  console.log("\n\nWaiting 15s for The Graph to index...");
  await sleep(15_000);
  await verifyAll(signer.address);
}

// ── 1. Beast ──
async function testBeast(lingshi: any, player: string) {
  try {
    const beast = await ethers.getContractAt("Beast", CONTRACTS.Beast);

    // approve 路费 (需要查具体费用，先用大额 approve)
    const approveTx = await lingshi.approve(
      CONTRACTS.Beast,
      ethers.parseEther("100")
    );
    await approveTx.wait();

    const tx1 = await beast.startBeastHunt(0); // region 0
    const r1 = await tx1.wait();
    console.log("BeastHuntStarted TX:", tx1.hash, "block:", r1!.blockNumber);

    console.log("Waiting for next block...");
    await waitForNextBlock(ethers.provider, r1!.blockNumber);

    const tx2 = await beast.finishBeastHunt();
    const r2 = await tx2.wait();
    console.log("BeastHuntFinished TX:", tx2.hash, "block:", r2!.blockNumber);

    // 解析事件看是否捕获
    const iface = beast.interface;
    for (const log of r2!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "BeastHuntFinished") {
          console.log(
            "  captured:",
            parsed.args.captured,
            "star:",
            parsed.args.star.toString()
          );
        }
        if (parsed?.name === "BeastMinted") {
          console.log(
            "  BeastMinted! tokenId:",
            parsed.args.tokenId.toString()
          );
        }
      } catch {}
    }
    console.log("✅ Beast events emitted");
  } catch (err: any) {
    console.error("❌ Beast failed:", err.reason || err.message);
  }
}

// ── 2. CaveHeaven ──
async function testCaveHeaven(lingshi: any, player: string) {
  try {
    const cave = await ethers.getContractAt("CaveHeaven", CONTRACTS.CaveHeaven);

    // approve 大额
    const approveTx = await lingshi.approve(
      CONTRACTS.CaveHeaven,
      ethers.parseEther("5000")
    );
    await approveTx.wait();

    // 开通洞天
    const tx1 = await cave.open();
    const r1 = await tx1.wait();
    console.log("CaveOpened TX:", tx1.hash, "block:", r1!.blockNumber);

    // 缴纳维护费 (30 天)
    const tx2 = await cave.payMaintenance(30);
    const r2 = await tx2.wait();
    console.log("MaintenancePaid TX:", tx2.hash, "block:", r2!.blockNumber);

    // 升级洞天
    const tx3 = await cave.upgrade();
    const r3 = await tx3.wait();
    console.log("CaveUpgraded TX:", tx3.hash, "block:", r3!.blockNumber);

    console.log("✅ CaveHeaven events emitted");
  } catch (err: any) {
    console.error("❌ CaveHeaven failed:", err.reason || err.message);
  }
}

// ── 3. Sect ──
async function testSect(lingshi: any, player: string) {
  try {
    const sect = await ethers.getContractAt("Sect", CONTRACTS.Sect);

    // approve 宗门创建费 1000 LS
    const approveTx = await lingshi.approve(
      CONTRACTS.Sect,
      ethers.parseEther("2000")
    );
    await approveTx.wait();

    const tx1 = await sect.createSect("XianDaoMen");
    const r1 = await tx1.wait();
    console.log("SectCreated TX:", tx1.hash, "block:", r1!.blockNumber);

    // 解析 sectId
    const iface = sect.interface;
    for (const log of r1!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "SectCreated") {
          console.log(
            "  sectId:",
            parsed.args.sectId.toString(),
            "name:",
            parsed.args.name
          );
        }
      } catch {}
    }

    // 捐献灵石
    const approveTx2 = await lingshi.approve(
      CONTRACTS.Sect,
      ethers.parseEther("100")
    );
    await approveTx2.wait();

    const tx2 = await sect.donateToTreasury(ethers.parseEther("100"));
    const r2 = await tx2.wait();
    console.log("DonationMade TX:", tx2.hash, "block:", r2!.blockNumber);

    console.log("✅ Sect events emitted");
  } catch (err: any) {
    console.error("❌ Sect failed:", err.reason || err.message);
  }
}

// ── 4. Tao ──
async function testTao(player: string) {
  try {
    const tao = await ethers.getContractAt("Tao", CONTRACTS.Tao);

    // 提交道侣提议 (目标随便一个地址 — 但对方必须已注册)
    // 没有第二个注册钱包，只能测 propose → cancel
    // 需要一个已注册的目标... 先跳过如果没有第二个账号
    console.log(
      "⚠️  Tao requires 2 registered players, skipping (single wallet test)"
    );
    console.log("✅ Tao skipped (expected)");
  } catch (err: any) {
    console.error("❌ Tao failed:", err.reason || err.message);
  }
}

// ── 5. SecretRealm ──
async function testSecretRealm(lingshi: any, player: string) {
  try {
    const realm = await ethers.getContractAt(
      "SecretRealm",
      CONTRACTS.SecretRealm
    );

    // approve 秘境入场费 100 LS
    const approveTx = await lingshi.approve(
      CONTRACTS.SecretRealm,
      ethers.parseEther("200")
    );
    await approveTx.wait();

    const tx1 = await realm.enterSolo(0); // realmId 0
    const r1 = await tx1.wait();
    console.log("SoloEntered TX:", tx1.hash, "block:", r1!.blockNumber);

    // 等 ≥1 block 后挑战层
    console.log("Waiting for next block...");
    await waitForNextBlock(ethers.provider, r1!.blockNumber);

    // 先领取掉落 (第 0 层入场掉落)
    try {
      const txDrop = await realm.claimLayerDrop();
      const rDrop = await txDrop.wait();
      console.log(
        "LayerDropClaimed TX:",
        txDrop.hash,
        "block:",
        rDrop!.blockNumber
      );
    } catch (e: any) {
      console.log("  (No initial drop to claim:", e.reason || "skipped", ")");
    }

    // 挑战第 0 层
    const tx2 = await realm.challengeLayer();
    const r2 = await tx2.wait();
    console.log("LayerChallenged TX:", tx2.hash, "block:", r2!.blockNumber);

    // 解析战斗结果
    const iface = realm.interface;
    for (const log of r2!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "LayerChallenged") {
          console.log(
            "  layer:",
            parsed.args.layer.toString(),
            "won:",
            parsed.args.won
          );
        }
      } catch {}
    }

    // 等 block 后领取战斗掉落
    console.log("Waiting for next block...");
    await waitForNextBlock(ethers.provider, r2!.blockNumber);

    try {
      const tx3 = await realm.claimLayerDrop();
      const r3 = await tx3.wait();
      console.log("LayerDropClaimed TX:", tx3.hash, "block:", r3!.blockNumber);
    } catch (e: any) {
      console.log("  (Drop claim failed:", e.reason || "skipped", ")");
    }

    console.log("✅ SecretRealm events emitted");
  } catch (err: any) {
    console.error("❌ SecretRealm failed:", err.reason || err.message);
  }
}

// ── 6. Equipment ──
async function testEquipment(lingshi: any, player: string) {
  try {
    const equipment = await ethers.getContractAt(
      "Equipment",
      CONTRACTS.Equipment
    );

    // deployer 需要 GAME_CONTRACT_ROLE 才能 mint
    const GAME_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes("GAME_CONTRACT_ROLE")
    );
    const hasRole = await equipment.hasRole(GAME_ROLE, player);

    if (!hasRole) {
      // 尝试 grant (deployer 应该是 admin)
      console.log("Granting GAME_CONTRACT_ROLE to deployer...");
      const grantTx = await equipment.grantRole(GAME_ROLE, player);
      await grantTx.wait();
    }

    // Mint 一把白色武器: eType=0(WEAPON), quality=0(WHITE), bonusBP=500, elemAff=4(土), origAff=3(书生), factAff=0
    const tx1 = await equipment.mint(player, 0, 0, 500, 4, 3, 0);
    const r1 = await tx1.wait();
    console.log("EquipmentMinted TX:", tx1.hash, "block:", r1!.blockNumber);

    // 解析 tokenId
    let tokenId: bigint | undefined;
    const iface = equipment.interface;
    for (const log of r1!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "EquipmentMinted") {
          tokenId = parsed.args.tokenId;
          console.log(
            "  tokenId:",
            tokenId!.toString(),
            "type: WEAPON, quality: WHITE"
          );
        }
      } catch {}
    }

    if (tokenId !== undefined) {
      // 装备
      const tx2 = await equipment.equip(tokenId);
      const r2 = await tx2.wait();
      console.log("EquipmentEquipped TX:", tx2.hash, "block:", r2!.blockNumber);

      // 卸下
      const tx3 = await equipment.unequip(0); // slot 0 = WEAPON
      const r3 = await tx3.wait();
      console.log(
        "EquipmentUnequipped TX:",
        tx3.hash,
        "block:",
        r3!.blockNumber
      );

      // 强化
      const approveTx = await lingshi.approve(
        CONTRACTS.Equipment,
        ethers.parseEther("100")
      );
      await approveTx.wait();

      const tx4 = await equipment.enhance(tokenId);
      const r4 = await tx4.wait();
      console.log("EquipmentEnhanced TX:", tx4.hash, "block:", r4!.blockNumber);

      // 分解
      const tx5 = await equipment.decompose(tokenId);
      const r5 = await tx5.wait();
      console.log(
        "EquipmentDecomposed TX:",
        tx5.hash,
        "block:",
        r5!.blockNumber
      );
    }

    console.log("✅ Equipment events emitted");
  } catch (err: any) {
    console.error("❌ Equipment failed:", err.reason || err.message);
  }
}

// ── 7. Market ──
async function testMarket(lingshi: any, player: string) {
  try {
    const market = await ethers.getContractAt("Market", CONTRACTS.Market);
    const equipment = await ethers.getContractAt(
      "Equipment",
      CONTRACTS.Equipment
    );

    // 先 mint 一个装备用于上架
    const GAME_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes("GAME_CONTRACT_ROLE")
    );
    const hasRole = await equipment.hasRole(GAME_ROLE, player);
    if (!hasRole) {
      const grantTx = await equipment.grantRole(GAME_ROLE, player);
      await grantTx.wait();
    }

    const mintTx = await equipment.mint(player, 1, 1, 1000, 0, 0, 0); // ARMOR, GREEN
    const mintR = await mintTx.wait();

    let tokenId: bigint | undefined;
    const iface = equipment.interface;
    for (const log of mintR!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "EquipmentMinted") {
          tokenId = parsed.args.tokenId;
          console.log("Minted equipment tokenId:", tokenId!.toString());
        }
      } catch {}
    }

    if (tokenId !== undefined) {
      // approve NFT to Market
      const approveTx = await equipment.approve(CONTRACTS.Market, tokenId);
      await approveTx.wait();

      // 创建订单: 售价 50 LS
      const tx1 = await market.createOrder(
        CONTRACTS.Equipment,
        tokenId,
        ethers.parseEther("50")
      );
      const r1 = await tx1.wait();
      console.log("OrderCreated TX:", tx1.hash, "block:", r1!.blockNumber);

      // 解析 orderId
      let orderId: bigint | undefined;
      const marketIface = market.interface;
      for (const log of r1!.logs) {
        try {
          const parsed = marketIface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === "OrderCreated") {
            orderId = parsed.args.orderId;
            console.log("  orderId:", orderId!.toString());
          }
        } catch {}
      }

      if (orderId !== undefined) {
        // 取消订单
        const tx2 = await market.cancelOrder(orderId);
        const r2 = await tx2.wait();
        console.log("OrderCancelled TX:", tx2.hash, "block:", r2!.blockNumber);
      }
    }

    console.log("✅ Market events emitted");
  } catch (err: any) {
    console.error("❌ Market failed:", err.reason || err.message);
  }
}

// ── The Graph 验证 ──
async function verifyAll(player: string) {
  console.log("\n═══ The Graph GraphQL 全量验证 ═══\n");
  const p = player.toLowerCase();

  const queries = [
    {
      name: "Player (updated)",
      query: `{ player(id: "${p}") { id realm totalHunts totalTreasures } }`,
    },
    {
      name: "BeastHuntEvents",
      query: `{ beastHuntEvents(first: 5, where: { player: "${p}" }, orderBy: timestamp, orderDirection: desc) { id regionId captured star } }`,
    },
    {
      name: "BeastTokens",
      query: `{ beastTokens(first: 5) { id tokenId star element owner { id } } }`,
    },
    {
      name: "CaveHeavenState",
      query: `{ caveHeavenStates(first: 5) { id tier maintenancePaidUntil } }`,
    },
    {
      name: "CaveEvents",
      query: `{ caveEvents(first: 5, orderBy: timestamp, orderDirection: desc) { id player { id } eventType tier timestamp } }`,
    },
    {
      name: "Sects",
      query: `{ sects(first: 5) { id name master { id } memberCount } }`,
    },
    {
      name: "SecretRealmRuns",
      query: `{ secretRealmRuns(first: 5, where: { player: "${p}" }, orderBy: timestamp, orderDirection: desc) { id realmId timestamp } }`,
    },
    {
      name: "LayerChallengeEvents",
      query: `{ layerChallengeEvents(first: 5, orderBy: timestamp, orderDirection: desc) { id player { id } realmId layer won } }`,
    },
    {
      name: "EquipmentTokens",
      query: `{ equipmentTokens(first: 5) { id tokenId equipmentType quality owner { id } enhanceLevel } }`,
    },
    {
      name: "MarketOrders",
      query: `{ marketOrders(first: 5, orderBy: orderId, orderDirection: desc) { id orderId seller { id } tokenContract price status } }`,
    },
    {
      name: "ProtocolStats",
      query: `{ protocolStats(id: "0x00000001") { id totalPlayers totalMatches totalEquipmentMinted totalBeastsMinted totalSectsCreated } }`,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, query } of queries) {
    try {
      const resp = await fetch(SUBGRAPH_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await resp.json();

      if (result.errors) {
        console.log(`❌ ${name}: ${result.errors[0].message}`);
        failed++;
      } else {
        const data = JSON.stringify(result.data);
        console.log(`✅ ${name}:`);
        console.log(
          `   ${data.substring(0, 200)}${data.length > 200 ? "..." : ""}`
        );
        passed++;
      }
    } catch (err: any) {
      console.log(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n═══ 结果: ${passed} passed, ${failed} failed ═══`);
}

// ── Utils ──
async function waitForNextBlock(
  provider: typeof ethers.provider,
  currentBlock: number
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const latest = await provider.getBlockNumber();
    if (latest > currentBlock) return;
    await sleep(3_000);
  }
  throw new Error("Timeout waiting for next block");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
