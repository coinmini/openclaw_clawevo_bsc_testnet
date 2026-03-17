import { ethers } from "hardhat";

/**
 * Binance Oracle VRF 订阅配置脚本
 *
 * 功能：创建订阅 → 充值 BNB → 添加 Consumer
 *
 * 使用方法：
 *   # 全流程（创建 + 充值 + 添加 consumer）
 *   npx hardhat run scripts/setup-vrf.ts --network bscTestnet
 *
 *   # 只添加 consumer（已有订阅 ID）
 *   VRF_SUBSCRIPTION_ID=123 VRF_CONSUMER=0x... npx hardhat run scripts/setup-vrf.ts --network bscTestnet
 *
 * 环境变量（可选）：
 *   VRF_COORDINATOR        — Coordinator 地址（默认 BSC Testnet）
 *   VRF_SUBSCRIPTION_ID    — 已有订阅 ID（跳过创建步骤）
 *   VRF_CONSUMER           — Consumer 合约地址（已部署的 BinanceVRFConsumer）
 *   VRF_DEPOSIT_BNB        — 充值 BNB 数量（默认 0.1）
 *
 * 参考文档：
 *   https://oracle.binance.com/docs/vrf/preparation/
 *   https://oracle.binance.com/docs/vrf/request-workflow/
 *   费用：0.0001 BNB / 请求，订阅上限 20 BNB
 */

// Binance Oracle VRF Coordinator 接口（订阅管理部分）
const VRF_COORDINATOR_ABI = [
  "function createSubscription() external returns (uint64 subId)",
  "function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers)",
  "function addConsumer(uint64 subId, address consumer) external",
  "function removeConsumer(uint64 subId, address consumer) external",
  "function cancelSubscription(uint64 subId, address to) external",
  "function pendingRequestExists(uint64 subId) external view returns (bool)",
  "function deposit(uint64 subId) external payable",
  "event SubscriptionCreated(uint64 indexed subId, address owner)",
  "event SubscriptionFunded(uint64 indexed subId, uint256 oldBalance, uint256 newBalance)",
  "event SubscriptionConsumerAdded(uint64 indexed subId, address consumer)",
];

// 网络配置
const NETWORK_CONFIG: Record<string, { coordinator: string; keyHash: string }> = {
  bscTestnet: {
    coordinator: "0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053",
    keyHash: "0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80",
  },
  bsc: {
    coordinator: "0x9632ADE542f12114f5E5AD4d6F8e47fB993955da",
    keyHash: "0xcd65a78499993598be303c914c3e37b0103ead6b1f279d1dbfa0ef080e7141a4",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = (await ethers.provider.getNetwork()).name;

  console.log("=== Binance Oracle VRF 订阅配置 ===");
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
  console.log("---");

  // 确定 Coordinator 地址
  const config = NETWORK_CONFIG[network];
  const coordinatorAddr = process.env.VRF_COORDINATOR || config?.coordinator;
  if (!coordinatorAddr) {
    throw new Error(`未配置 VRF_COORDINATOR，且网络 ${network} 无默认配置`);
  }
  console.log("VRF Coordinator:", coordinatorAddr);

  const coordinator = new ethers.Contract(coordinatorAddr, VRF_COORDINATOR_ABI, deployer);

  // ── Step 1: 创建订阅（或使用已有） ──
  let subId: bigint;
  const existingSubId = process.env.VRF_SUBSCRIPTION_ID;

  if (existingSubId && existingSubId !== "0") {
    subId = BigInt(existingSubId);
    console.log(`\n使用已有订阅 ID: ${subId}`);
  } else {
    console.log("\n创建新订阅...");
    const tx = await coordinator.createSubscription();
    const receipt = await tx.wait();

    // 从事件中提取 subId
    const event = receipt.logs.find(
      (log: { topics: string[] }) => log.topics[0] === ethers.id("SubscriptionCreated(uint64,address)"),
    );
    if (event) {
      subId = BigInt(event.topics[1]);
    } else {
      // 回退：尝试从 return value 获取
      throw new Error("无法从事件中提取订阅 ID，请检查交易 receipt");
    }
    console.log(`订阅创建成功！subId: ${subId}`);
    console.log(`交易哈希: ${receipt.hash}`);
  }

  // ── Step 2: 查询订阅状态 ──
  console.log("\n查询订阅状态...");
  const [balance, reqCount, owner, consumers] = await coordinator.getSubscription(subId);
  console.log(`  余额: ${ethers.formatEther(balance)} BNB`);
  console.log(`  请求次数: ${reqCount}`);
  console.log(`  Owner: ${owner}`);
  console.log(`  Consumers: ${consumers.length > 0 ? consumers.join(", ") : "(无)"}`);

  // ── Step 3: 充值 BNB ──
  const depositBNB = process.env.VRF_DEPOSIT_BNB || "0.1";
  const depositWei = ethers.parseEther(depositBNB);

  if (balance < depositWei) {
    console.log(`\n充值 ${depositBNB} BNB 到订阅 ${subId}...`);
    const depositTx = await coordinator.deposit(subId, { value: depositWei });
    const depositReceipt = await depositTx.wait();
    console.log(`充值成功！交易哈希: ${depositReceipt.hash}`);

    // 验证余额
    const [newBalance] = await coordinator.getSubscription(subId);
    console.log(`  新余额: ${ethers.formatEther(newBalance)} BNB`);
  } else {
    console.log(`\n订阅余额充足 (${ethers.formatEther(balance)} BNB)，跳过充值`);
  }

  // ── Step 4: 添加 Consumer ──
  const consumerAddr = process.env.VRF_CONSUMER;
  if (consumerAddr) {
    const isAlreadyAdded = consumers.some(
      (c: string) => c.toLowerCase() === consumerAddr.toLowerCase(),
    );

    if (isAlreadyAdded) {
      console.log(`\nConsumer ${consumerAddr} 已添加到订阅，跳过`);
    } else {
      console.log(`\n添加 Consumer ${consumerAddr} 到订阅 ${subId}...`);
      const addTx = await coordinator.addConsumer(subId, consumerAddr);
      const addReceipt = await addTx.wait();
      console.log(`添加成功！交易哈希: ${addReceipt.hash}`);
    }
  } else {
    console.log("\n未指定 VRF_CONSUMER 地址，跳过添加 Consumer");
    console.log("部署 BinanceVRFConsumer 后，运行：");
    console.log(`  VRF_SUBSCRIPTION_ID=${subId} VRF_CONSUMER=<地址> npx hardhat run scripts/setup-vrf.ts --network ${network}`);
  }

  // ── 输出配置汇总 ──
  console.log("\n=== 配置汇总 ===");
  console.log(`VRF_COORDINATOR=${coordinatorAddr}`);
  console.log(`VRF_KEY_HASH=${config?.keyHash || process.env.VRF_KEY_HASH || "未配置"}`);
  console.log(`VRF_SUBSCRIPTION_ID=${subId}`);
  if (consumerAddr) {
    console.log(`VRF_CONSUMER=${consumerAddr}`);
  }
  console.log("\n将以上变量写入 .env 文件后即可部署 BinanceVRFConsumer。");
  console.log("费用参考：0.0001 BNB / 请求，0.1 BNB 可支持 ~1000 次渡劫");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
