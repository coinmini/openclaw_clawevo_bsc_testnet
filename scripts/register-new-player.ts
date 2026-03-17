import { ethers } from "hardhat";

/**
 * 注册新玩家 — 使用随机钱包
 *
 * 流程:
 *   1. 生成随机钱包
 *   2. 从 deployer 转 0.01 tBNB 给新钱包
 *   3. registerIntent(origin, faction)
 *   4. 等待 ≥1 block
 *   5. finalizeRegistration()
 *   6. 查询 The Graph 验证
 *
 * 使用:
 *   npx hardhat run scripts/register-new-player.ts --network bscTestnet
 */

const REGISTER_ADDRESS = "0xFEceDB3796DA00F43B3C8189007182607240f532";
const FALLBACK_GRAPHQL =
  "https://api.clawevo.ai/subgraphs/name/huasheng";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 生成新钱包
  const newWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log("New player wallet:", newWallet.address);
  console.log("Private key:", newWallet.privateKey);

  // 从 deployer 转 0.01 tBNB
  console.log("\n=== Funding new wallet with 0.01 tBNB ===");
  const fundTx = await deployer.sendTransaction({
    to: newWallet.address,
    value: ethers.parseEther("0.01"),
  });
  await fundTx.wait();
  console.log("Fund TX:", fundTx.hash);

  const balance = await ethers.provider.getBalance(newWallet.address);
  console.log("New wallet balance:", ethers.formatEther(balance), "BNB");

  // 连接合约
  const register = new ethers.Contract(
    REGISTER_ADDRESS,
    [
      "function registerIntent(uint8 origin, uint8 faction) external",
      "function finalizeRegistration() external",
      "function isRegistered(address) view returns (bool)",
      "function getCultivator(address) view returns (tuple(uint8 origin, uint8 element, uint16 attack, uint16 defense, uint16 perception, uint16 wisdom, uint8 realm, uint256 xp))",
    ],
    newWallet,
  );

  // Step 1: registerIntent
  console.log("\n=== Step 1: registerIntent ===");
  const origin = Math.floor(Math.random() * 4); // 0-3 随机出身
  const originNames = ["武夫", "道士", "妖族", "书生"];
  const faction = Math.floor(Math.random() * 4); // 0-3 随机阵营

  console.log("Origin:", origin, `(${originNames[origin]})`);
  console.log("Faction:", faction);
  const tx1 = await register.registerIntent(origin, faction, {
    gasPrice: ethers.parseUnits("1", "gwei"),
  });
  console.log("TX1 hash:", tx1.hash);
  const receipt1 = await tx1.wait();
  console.log("TX1 confirmed in block:", receipt1!.blockNumber);

  // 等待下一个 block
  console.log("\nWaiting for next block...");
  await waitForNextBlock(ethers.provider, receipt1!.blockNumber);
  console.log("Next block reached.");

  // Step 2: finalizeRegistration
  console.log("\n=== Step 2: finalizeRegistration ===");

  const tx2 = await register.finalizeRegistration({
    gasPrice: ethers.parseUnits("1", "gwei"),
  });
  console.log("TX2 hash:", tx2.hash);
  const receipt2 = await tx2.wait();
  console.log("TX2 confirmed in block:", receipt2!.blockNumber);

  // 链上验证
  const cultivator = await register.getCultivator(newWallet.address);
  console.log("\n=== On-chain Cultivator Data ===");
  console.log("Origin:", cultivator.origin);
  console.log("Element:", cultivator.element);
  console.log("Attack:", cultivator.attack.toString());
  console.log("Defense:", cultivator.defense.toString());
  console.log("Perception:", cultivator.perception.toString());
  console.log("Wisdom:", cultivator.wisdom.toString());
  console.log("Realm:", cultivator.realm);

  // 查询 The Graph (使用 fallback)
  console.log("\nWaiting 15s for The Graph to index...");
  await sleep(15_000);
  await querySubgraphPlayer(newWallet.address);
}

async function waitForNextBlock(
  provider: typeof ethers.provider,
  currentBlock: number,
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const latest = await provider.getBlockNumber();
    if (latest > currentBlock) return;
    await sleep(3_000);
  }
  throw new Error("Timeout waiting for next block");
}

async function querySubgraphPlayer(playerAddress: string) {
  console.log("\n=== Querying The Graph (self-hosted fallback) ===");
  console.log("URL:", FALLBACK_GRAPHQL);

  const query = `
    query GetPlayer($id: ID!) {
      player(id: $id) {
        id
        origin
        element
        realm
        registeredAt
        registeredBlock
      }
    }
  `;

  try {
    const response = await fetch(FALLBACK_GRAPHQL, {
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
      console.log("\nRegistration successful! New player indexed.");
    } else {
      console.log(
        "\nPlayer not found yet. Graph Node may need more time to index.",
      );
    }
  } catch (err) {
    console.error("Failed to query:", err);
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
