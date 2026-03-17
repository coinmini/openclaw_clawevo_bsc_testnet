import { ethers } from "hardhat";

/**
 * 注册玩家测试脚本 — 验证 The Graph 索引
 *
 * 两步注册流程:
 *   TX1: registerIntent(origin, faction)
 *   TX2: finalizeRegistration()   (隔 ≥1 block)
 *
 * 使用方法:
 *   npx hardhat run scripts/test-register.ts --network bscTestnet
 */

const REGISTER_ADDRESS = "0xFEceDB3796DA00F43B3C8189007182607240f532";
const SUBGRAPH_GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ||
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(signer.address)),
    "BNB"
  );

  const register = await ethers.getContractAt("Register", REGISTER_ADDRESS);

  // 检查是否已注册
  const alreadyRegistered = await register.isRegistered(signer.address);
  if (alreadyRegistered) {
    console.log("Player already registered! Skipping registration.");
    console.log("Querying The Graph for existing player data...");
    await querySubgraphPlayer(signer.address);
    return;
  }

  // ── Step 1: registerIntent ──
  console.log("\n=== Step 1: registerIntent ===");
  const origin = 3; // 书生 (wisdom +15%)
  const faction = 1; // 阵营

  console.log("Origin:", origin, "(书生)");
  console.log("Faction:", faction);

  const tx1 = await register.registerIntent(origin, faction);
  console.log("TX1 hash:", tx1.hash);
  const receipt1 = await tx1.wait();
  console.log("TX1 confirmed in block:", receipt1!.blockNumber);

  // ── 等待 ≥1 block ──
  console.log("\nWaiting for next block...");
  await waitForNextBlock(ethers.provider, receipt1!.blockNumber);
  console.log("Next block reached.");

  // ── Step 2: finalizeRegistration ──
  console.log("\n=== Step 2: finalizeRegistration ===");

  const tx2 = await register.finalizeRegistration();
  console.log("TX2 hash:", tx2.hash);
  const receipt2 = await tx2.wait();
  console.log("TX2 confirmed in block:", receipt2!.blockNumber);

  // 读取链上数据验证
  const cultivator = await register.getCultivator(signer.address);
  console.log("\n=== On-chain Cultivator Data ===");
  console.log("Origin:", cultivator.origin);
  console.log("Element:", cultivator.element);
  console.log("Attack:", cultivator.attack.toString());
  console.log("Defense:", cultivator.defense.toString());
  console.log("Perception:", cultivator.perception.toString());
  console.log("Wisdom:", cultivator.wisdom.toString());
  console.log("Realm:", cultivator.realm);

  // ── 查询 The Graph ──
  console.log("\nWaiting 10s for The Graph to index...");
  await sleep(10_000);
  await querySubgraphPlayer(signer.address);
}

async function waitForNextBlock(
  provider: typeof ethers.provider,
  currentBlock: number
) {
  const deadline = Date.now() + 120_000; // 2 min timeout
  while (Date.now() < deadline) {
    const latest = await provider.getBlockNumber();
    if (latest > currentBlock) return;
    await sleep(3_000);
  }
  throw new Error("Timeout waiting for next block");
}

async function querySubgraphPlayer(playerAddress: string) {
  console.log("\n=== Querying The Graph GraphQL ===");
  console.log("URL:", SUBGRAPH_GRAPHQL_URL);

  const query = `
    query GetPlayer($id: ID!) {
      player(id: $id) {
        id
        origin
        element
        realm
        registeredAt
        registeredBlock
        totalMatchesPlayed
        totalHunts
      }
    }
  `;

  try {
    const response = await fetch(SUBGRAPH_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { id: playerAddress.toLowerCase() },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", JSON.stringify(result.errors, null, 2));
      return;
    }

    if (result.data?.player) {
      console.log("\nThe Graph indexed player data:");
      console.log(JSON.stringify(result.data.player, null, 2));
      console.log("\n✅ The Graph indexing verified successfully!");
    } else {
      console.log(
        "\n⚠️  Player not found in The Graph yet. It may need more time to index."
      );
      console.log("Try querying manually:");
      console.log(`  curl -X POST ${SUBGRAPH_GRAPHQL_URL} \\`);
      console.log(`    -H "Content-Type: application/json" \\`);
      console.log(
        `    -d '{"query":"{ player(id: \\"${playerAddress.toLowerCase()}\\") { id origin element realm } }"}'`
      );
    }
  } catch (err) {
    console.error("Failed to query The Graph:", err);
    console.log(
      "\nNote: Ensure The Graph subgraph is deployed and accessible at",
      SUBGRAPH_GRAPHQL_URL
    );
  }
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
