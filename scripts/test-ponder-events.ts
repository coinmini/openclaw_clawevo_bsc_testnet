import { ethers } from "hardhat";

/**
 * The Graph 索引全合约事件测试脚本
 *
 * 测试已注册玩家可触发的所有合约事件:
 *   1. Cultivation: startCultivation → endCultivation
 *   2. Treasure:    startTreasure → finishTreasure (block-delay)
 *   3. Hunt:        hunt → claimHuntDrop (block-delay)
 *   4. Battle:      createChallenge → cancelChallenge
 *
 * 前提: 玩家已通过 test-register.ts 注册 (realm=0, 20 LS)
 *
 * 使用:
 *   npx hardhat run scripts/test-ponder-events.ts --network bscTestnet
 */

// ── 合约地址 ──
const CONTRACTS = {
  LingShi: "0x...", // 需从部署填入，先动态读取
  Register: "0xFEceDB3796DA00F43B3C8189007182607240f532",
  Cultivation: "0xB8D4f0f1BC9691dA59661b2d36B5123ACB8b0AaD",
  Hunt: "0x6Ab5b25EE289dA6763C17b3405aF27267cA8316f",
  Treasure: "0xc5d583C2fdF23033c959652567A83c798b71121a",
  Battle: "0xC5e4e7F50C4DB5F07623C90B37eb2AD80DF40347",
};

const SUBGRAPH_GRAPHQL =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(signer.address)),
    "BNB\n"
  );

  // 获取合约实例
  const register = await ethers.getContractAt("Register", CONTRACTS.Register);
  const cultivation = await ethers.getContractAt(
    "Cultivation",
    CONTRACTS.Cultivation
  );
  const treasure = await ethers.getContractAt("Treasure", CONTRACTS.Treasure);
  const hunt = await ethers.getContractAt("Hunt", CONTRACTS.Hunt);
  const battle = await ethers.getContractAt("Battle", CONTRACTS.Battle);

  // 读取 LingShi 地址
  const lingshiAddr = await register.lingshi();
  const lingshi = await ethers.getContractAt("LingShi", lingshiAddr);
  console.log("LingShi:", lingshiAddr);

  const lsBal = await lingshi.balanceOf(signer.address);
  console.log("LS Balance:", ethers.formatEther(lsBal), "LS\n");

  // 确认已注册
  const isReg = await register.isRegistered(signer.address);
  if (!isReg) {
    console.error("Player not registered! Run test-register.ts first.");
    return;
  }

  // ═══════════════════════════════════════
  //  1. Cultivation 修炼
  // ═══════════════════════════════════════
  console.log("═══ 1. Cultivation 修炼 ═══");
  await testCultivation(cultivation);

  // ═══════════════════════════════════════
  //  2. Treasure 寻宝 (block-delay)
  // ═══════════════════════════════════════
  console.log("\n═══ 2. Treasure 寻宝 ═══");
  await testTreasure(treasure, lingshi, signer.address);

  // ═══════════════════════════════════════
  //  3. Hunt 狩猎 (block-delay)
  // ═══════════════════════════════════════
  console.log("\n═══ 3. Hunt 狩猎 ═══");
  await testHunt(hunt, lingshi, signer.address);

  // ═══════════════════════════════════════
  //  4. Battle 约战
  // ═══════════════════════════════════════
  console.log("\n═══ 4. Battle 约战 ═══");
  await testBattle(battle, lingshi, signer.address);

  // ═══════════════════════════════════════
  //  The Graph 验证
  // ═══════════════════════════════════════
  console.log("\n\nWaiting 15s for The Graph to index all events...");
  await sleep(15_000);
  await verifySubgraphIndexing(signer.address);
}

// ── Cultivation ──
async function testCultivation(
  cultivation: Awaited<ReturnType<typeof ethers.getContractAt>>
) {
  try {
    // 检查是否正在修炼
    const session = await cultivation.getSession(
      await cultivation.runner!.getAddress()
    );
    if (session.active) {
      console.log("Already cultivating, ending session first...");
      const tx = await cultivation.endCultivation();
      const r = await tx.wait();
      console.log("CultivationEnded TX:", tx.hash, "block:", r!.blockNumber);
      return;
    }

    // 开始修炼
    const tx1 = await cultivation.startCultivation();
    const r1 = await tx1.wait();
    console.log("CultivationStarted TX:", tx1.hash, "block:", r1!.blockNumber);

    // 等几个块再结束（至少让 duration > 0）
    console.log("Waiting ~15s for some cultivation time...");
    await sleep(15_000);

    // 结束修炼
    const tx2 = await cultivation.endCultivation();
    const r2 = await tx2.wait();
    console.log("CultivationEnded TX:", tx2.hash, "block:", r2!.blockNumber);
    console.log("✅ Cultivation events emitted");
  } catch (err: any) {
    console.error("❌ Cultivation failed:", err.reason || err.message);
  }
}

// ── Treasure ──
async function testTreasure(
  treasure: Awaited<ReturnType<typeof ethers.getContractAt>>,
  lingshi: Awaited<ReturnType<typeof ethers.getContractAt>>,
  player: string
) {
  try {
    // 检查是否有 pending intent
    const intent = await treasure.intents(player);
    if (intent.pending) {
      console.log("Pending treasure intent found, finishing...");
      const tx = await treasure.finishTreasure();
      const r = await tx.wait();
      console.log("TreasureFinished TX:", tx.hash, "block:", r!.blockNumber);
      return;
    }

    // region 0 = 碧翠原野, 路费 3 LS
    const bal = await lingshi.balanceOf(player);
    console.log("LS Balance:", ethers.formatEther(bal));
    if (bal < ethers.parseEther("3")) {
      console.log("⚠️  Insufficient LS for treasure (need 3), skipping");
      return;
    }

    // 先 approve 路费
    const approveTx = await lingshi.approve(
      await treasure.getAddress(),
      ethers.parseEther("3")
    );
    await approveTx.wait();

    const tx1 = await treasure.startTreasure(0); // region 0
    const r1 = await tx1.wait();
    console.log("TreasureStarted TX:", tx1.hash, "block:", r1!.blockNumber);

    // 等 ≥1 block
    console.log("Waiting for next block...");
    await waitForNextBlock(ethers.provider, r1!.blockNumber);

    const tx2 = await treasure.finishTreasure();
    const r2 = await tx2.wait();
    console.log("TreasureFinished TX:", tx2.hash, "block:", r2!.blockNumber);
    console.log("✅ Treasure events emitted");
  } catch (err: any) {
    console.error("❌ Treasure failed:", err.reason || err.message);
  }
}

// ── Hunt ──
async function testHunt(
  hunt: Awaited<ReturnType<typeof ethers.getContractAt>>,
  lingshi: Awaited<ReturnType<typeof ethers.getContractAt>>,
  player: string
) {
  try {
    // 检查冷却时间
    const lastTime = await hunt.lastHuntTime(player);
    const now = Math.floor(Date.now() / 1000);
    if (lastTime > 0 && now - Number(lastTime) < 7200) {
      console.log(
        "⚠️  Hunt on cooldown, remaining:",
        7200 - (now - Number(lastTime)),
        "s, skipping"
      );
      return;
    }

    // 检查是否有未领取的掉落
    const lastHunt = await hunt.lastHunt(player);
    if (lastHunt.won && !lastHunt.dropClaimed) {
      console.log("Unclaimed hunt drop found, claiming...");
      const tx = await hunt.claimHuntDrop();
      const r = await tx.wait();
      console.log("HuntDropClaimed TX:", tx.hash, "block:", r!.blockNumber);
      return;
    }

    // region 0 = 碧翠原野, 路费 10 LS
    const bal = await lingshi.balanceOf(player);
    console.log("LS Balance:", ethers.formatEther(bal));
    if (bal < ethers.parseEther("10")) {
      console.log("⚠️  Insufficient LS for hunt (need 10), skipping");
      return;
    }

    // approve 路费
    const approveTx = await lingshi.approve(
      await hunt.getAddress(),
      ethers.parseEther("10")
    );
    await approveTx.wait();

    const tx1 = await hunt.hunt(0); // region 0
    const r1 = await tx1.wait();
    console.log("HuntStarted TX:", tx1.hash, "block:", r1!.blockNumber);

    // 等 ≥1 block 后领取掉落
    console.log("Waiting for next block...");
    await waitForNextBlock(ethers.provider, r1!.blockNumber);

    // 检查是否胜利
    const huntResult = await hunt.lastHunt(player);
    console.log("Won:", huntResult.won);

    if (huntResult.won) {
      const tx2 = await hunt.claimHuntDrop();
      const r2 = await tx2.wait();
      console.log("HuntDropClaimed TX:", tx2.hash, "block:", r2!.blockNumber);
    } else {
      console.log("Lost the hunt, no drop to claim");
    }
    console.log("✅ Hunt events emitted");
  } catch (err: any) {
    console.error("❌ Hunt failed:", err.reason || err.message);
  }
}

// ── Battle ──
async function testBattle(
  battle: Awaited<ReturnType<typeof ethers.getContractAt>>,
  lingshi: Awaited<ReturnType<typeof ethers.getContractAt>>,
  player: string
) {
  try {
    const bal = await lingshi.balanceOf(player);
    console.log("LS Balance:", ethers.formatEther(bal));
    if (bal < ethers.parseEther("1")) {
      console.log("⚠️  Insufficient LS for battle (need 1), skipping");
      return;
    }

    // approve 赌注 (1 LS minimum)
    const wager = ethers.parseEther("1");
    const approveTx = await lingshi.approve(await battle.getAddress(), wager);
    await approveTx.wait();

    // 创建约战单
    const tx1 = await battle.createChallenge(wager);
    const r1 = await tx1.wait();
    console.log("ChallengeCreated TX:", tx1.hash, "block:", r1!.blockNumber);

    // 解析 ChallengeCreated event 获取 challengeId
    const iface = battle.interface;
    const log = r1!.logs.find((l: any) => {
      try {
        return (
          iface.parseLog({ topics: l.topics as string[], data: l.data })
            ?.name === "ChallengeCreated"
        );
      } catch {
        return false;
      }
    });

    if (log) {
      const parsed = iface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      })!;
      const challengeId = parsed.args.challengeId;
      console.log("Challenge ID:", challengeId.toString());

      // 取消约战单（退还赌注）
      const tx2 = await battle.cancelChallenge(challengeId);
      const r2 = await tx2.wait();
      console.log(
        "ChallengeCancelled TX:",
        tx2.hash,
        "block:",
        r2!.blockNumber
      );
    }

    console.log("✅ Battle events emitted");
  } catch (err: any) {
    console.error("❌ Battle failed:", err.reason || err.message);
  }
}

// ── The Graph Verification ──
async function verifySubgraphIndexing(playerAddress: string) {
  console.log("\n═══ The Graph GraphQL 验证 ═══");
  console.log("URL:", SUBGRAPH_GRAPHQL);

  const addr = playerAddress.toLowerCase();
  const queries = [
    {
      name: "Player",
      query: `{ player(id: "${addr}") { id origin element realm totalHunts totalTreasures } }`,
    },
    {
      name: "CultivationSessions",
      query: `{ cultivationSessions(first: 5, where: { player: "${addr}" }) { id duration lsEarned expGained } }`,
    },
    {
      name: "TreasureEvents",
      query: `{ treasureEvents(first: 5, where: { player: "${addr}" }, orderBy: timestamp, orderDirection: desc) { id regionId quality reward } }`,
    },
    {
      name: "HuntEvents",
      query: `{ huntEvents(first: 5, where: { player: "${addr}" }, orderBy: timestamp, orderDirection: desc) { id regionId won playerScore monsterScore } }`,
    },
    {
      name: "Challenges",
      query: `{ challenges(first: 5, orderBy: challengeId, orderDirection: desc) { id creator wager status } }`,
    },
  ];

  for (const { name, query } of queries) {
    try {
      const resp = await fetch(SUBGRAPH_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await resp.json();

      if (result.errors) {
        console.log(`\n❌ ${name}:`, JSON.stringify(result.errors[0].message));
      } else {
        console.log(`\n✅ ${name}:`);
        console.log(JSON.stringify(result.data, null, 2));
      }
    } catch (err: any) {
      console.log(`\n❌ ${name}: fetch failed -`, err.message);
    }
  }
}

// ── Utilities ──
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
