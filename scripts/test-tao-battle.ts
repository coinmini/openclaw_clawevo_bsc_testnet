import { ethers } from "hardhat";

/**
 * 测试 Tao (道侣) + Battle (对战) — 需要两个已注册玩家
 *
 * 流程:
 *   1. 生成 Player B 钱包，deployer 转 BNB + LS
 *   2. 注册 Player B（两步：registerIntent → finalizeRegistration）
 *   3. 提升 Player B 境界
 *   4. Tao: A propose → B accept → A dissolve
 *   5. Battle: A createChallenge → B acceptChallenge (MatchSettled)
 *
 * 使用:
 *   npx hardhat run scripts/test-tao-battle.ts --network bscTestnet
 */

const CONTRACTS = {
  Register: "0xFEceDB3796DA00F43B3C8189007182607240f532",
  Tao: "0x0dAE949Cb62E5C3685EE2e4640D768e9900ED928",
  Battle: "0xC5e4e7F50C4DB5F07623C90B37eb2AD80DF40347",
};

const SUBGRAPH_GRAPHQL =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Player A (deployer):", deployer.address);

  // ── 获取合约 ──
  const register = await ethers.getContractAt("Register", CONTRACTS.Register);
  const lingshiAddr = await register.lingshi();
  const lingshi = await ethers.getContractAt("LingShi", lingshiAddr);

  // ── 1. 创建 Player B ──
  console.log("\n═══ 1. Setup Player B ═══");
  const playerBWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log("Player B:", playerBWallet.address);

  // 转 0.05 BNB 给 B（用于 gas）
  console.log("Sending 0.05 BNB to Player B...");
  const bnbTx = await deployer.sendTransaction({
    to: playerBWallet.address,
    value: ethers.parseEther("0.05"),
  });
  await bnbTx.wait();

  const bBnbBal = await ethers.provider.getBalance(playerBWallet.address);
  console.log("Player B BNB:", ethers.formatEther(bBnbBal));

  // Mint LS 给 B（deployer 有 MINTER_ROLE）
  console.log("Minting 500 LS to Player B...");
  const mintTx = await lingshi.mint(
    playerBWallet.address,
    ethers.parseEther("500")
  );
  await mintTx.wait();

  // ── 2. 注册 Player B ──
  console.log("\n═══ 2. Register Player B ═══");
  const registerB = register.connect(playerBWallet) as typeof register;

  // Step 1: registerIntent
  const origin = 0; // 草莽
  const faction = 2; // 阵营

  const tx1 = await registerB.registerIntent(origin, faction);
  const r1 = await tx1.wait();
  console.log("RegisterIntent TX:", tx1.hash, "block:", r1!.blockNumber);

  // 等 ≥1 block
  console.log("Waiting for next block...");
  await waitForNextBlock(ethers.provider, r1!.blockNumber);

  // Step 2: finalizeRegistration
  const tx2 = await registerB.finalizeRegistration();
  const r2 = await tx2.wait();
  console.log("FinalizeRegistration TX:", tx2.hash, "block:", r2!.blockNumber);

  // 提升 B 境界到 2（金丹）—— 确保 Tao 的 realm diff ≤ 2
  console.log("Upgrading Player B realm to 2 (金丹)...");
  const realmTx = await register.updateRealm(playerBWallet.address, 2);
  await realmTx.wait();

  const cultB = await register.getCultivator(playerBWallet.address);
  console.log(
    "Player B: origin=草莽, element=",
    cultB.element.toString(),
    "realm=",
    cultB.realm.toString()
  );

  // ═══ 3. Tao 道侣 ═══
  console.log("\n═══ 3. Tao 道侣 ═══");
  await testTao(deployer, playerBWallet, lingshi);

  // ═══ 4. Battle 对战 ═══
  console.log("\n═══ 4. Battle 对战 ═══");
  await testBattle(deployer, playerBWallet, lingshi);

  // ═══ The Graph 验证 ═══
  console.log("\n\nWaiting 15s for The Graph to index...");
  await sleep(15_000);
  await verifySubgraph(deployer.address, playerBWallet.address);
}

// ── Tao ──
async function testTao(playerA: any, playerBWallet: any, lingshi: any) {
  try {
    const tao = await ethers.getContractAt("Tao", CONTRACTS.Tao);
    const taoA = tao.connect(playerA) as typeof tao;
    const taoB = tao.connect(playerBWallet) as typeof tao;

    // A 需要 approve 聘礼费 50 LS
    const approveTx = await lingshi
      .connect(playerA)
      .approve(CONTRACTS.Tao, ethers.parseEther("100"));
    await approveTx.wait();

    // A → B 提出道侣
    console.log("A proposing partnership to B...");
    const tx1 = await taoA.proposePartnership(playerBWallet.address);
    const r1 = await tx1.wait();
    console.log("PartnershipProposed TX:", tx1.hash, "block:", r1!.blockNumber);

    // B approve 聘礼费
    const approveTxB = await lingshi
      .connect(playerBWallet)
      .approve(CONTRACTS.Tao, ethers.parseEther("100"));
    await approveTxB.wait();

    // B 接受
    console.log("B accepting partnership...");
    const tx2 = await taoB.acceptPartnership();
    const r2 = await tx2.wait();
    console.log("PartnershipFormed TX:", tx2.hash, "block:", r2!.blockNumber);

    // A 解除道侣关系
    const approveTx2 = await lingshi
      .connect(playerA)
      .approve(CONTRACTS.Tao, ethers.parseEther("100"));
    await approveTx2.wait();

    console.log("A dissolving partnership...");
    const tx3 = await taoA.dissolvePartnership();
    const r3 = await tx3.wait();
    console.log(
      "PartnershipDissolved TX:",
      tx3.hash,
      "block:",
      r3!.blockNumber
    );

    console.log("✅ Tao: propose → accept → dissolve, all events emitted");
  } catch (err: any) {
    console.error("❌ Tao failed:", err.reason || err.message);
  }
}

// ── Battle ──
async function testBattle(playerA: any, playerBWallet: any, lingshi: any) {
  try {
    const battle = await ethers.getContractAt("Battle", CONTRACTS.Battle);
    const battleA = battle.connect(playerA) as typeof battle;
    const battleB = battle.connect(playerBWallet) as typeof battle;

    const wager = ethers.parseEther("5"); // 5 LS

    // A approve + 创建约战单
    const approveA = await lingshi
      .connect(playerA)
      .approve(CONTRACTS.Battle, wager);
    await approveA.wait();

    console.log("A creating challenge (5 LS wager)...");
    const tx1 = await battleA.createChallenge(wager);
    const r1 = await tx1.wait();
    console.log("ChallengeCreated TX:", tx1.hash, "block:", r1!.blockNumber);

    // 解析 challengeId
    let challengeId: bigint | undefined;
    const iface = battle.interface;
    for (const log of r1!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "ChallengeCreated") {
          challengeId = parsed.args.challengeId;
          console.log("  challengeId:", challengeId!.toString());
        }
      } catch {}
    }

    if (challengeId === undefined) {
      console.error("Failed to parse challengeId");
      return;
    }

    // B approve + 接受挑战 → 触发 MatchSettled
    const approveB = await lingshi
      .connect(playerBWallet)
      .approve(CONTRACTS.Battle, wager);
    await approveB.wait();

    console.log("B accepting challenge...");
    const tx2 = await battleB.acceptChallenge(challengeId);
    const r2 = await tx2.wait();
    console.log("MatchSettled TX:", tx2.hash, "block:", r2!.blockNumber);

    // 解析 MatchSettled
    for (const log of r2!.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "MatchSettled") {
          const winner = parsed.args.winner;
          const payout = parsed.args.payout;
          const isDraw = winner === ethers.ZeroAddress;
          console.log(
            "  winner:",
            isDraw ? "DRAW" : winner,
            "payout:",
            ethers.formatEther(payout),
            "LS"
          );
        }
      } catch {}
    }

    console.log("✅ Battle: create → accept → settle, all events emitted");
  } catch (err: any) {
    console.error("❌ Battle failed:", err.reason || err.message);
  }
}

// ── The Graph 验证 ──
async function verifySubgraph(playerA: string, playerB: string) {
  console.log("\n═══ The Graph GraphQL 验证 ═══\n");
  const a = playerA.toLowerCase();
  const b = playerB.toLowerCase();

  const queries = [
    {
      name: "Player B registered",
      query: `{ player(id: "${b}") { id origin element realm registeredAt } }`,
    },
    {
      name: "Partnerships",
      query: `{ partnerships(first: 5) { id partnerA { id } partnerB { id } formedAt dissolvedAt } }`,
    },
    {
      name: "TaoEvents",
      query: `{ taoEvents(first: 10, orderBy: timestamp, orderDirection: desc) { id eventType initiator { id } target { id } fee timestamp } }`,
    },
    {
      name: "BattleMatches",
      query: `{ battleMatches(first: 5, orderBy: settledAt, orderDirection: desc) { id matchId challengeId playerA { id } playerB { id } winner payout } }`,
    },
    {
      name: "Challenges (updated)",
      query: `{ challenges(first: 5, orderBy: challengeId, orderDirection: desc) { id challengeId status wager settledAt matchId } }`,
    },
    {
      name: "Player A stats",
      query: `{ player(id: "${a}") { id totalMatchesPlayed totalMatchesWon totalWagerWon totalWagerLost } }`,
    },
    {
      name: "Player B stats",
      query: `{ player(id: "${b}") { id totalMatchesPlayed totalMatchesWon totalWagerWon totalWagerLost } }`,
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
        console.log(`✅ ${name}:`);
        console.log(`   ${JSON.stringify(result.data)}`);
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
