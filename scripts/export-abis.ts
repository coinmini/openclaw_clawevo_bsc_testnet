import * as fs from "fs";
import * as path from "path";

/**
 * 从 Hardhat artifacts 中提取纯 ABI JSON 文件
 *
 * 输出目录：abis/
 * 用途：Agent 用 cast --abi 自动编解码调用
 *
 * 使用方法：
 *   npx ts-node scripts/export-abis.ts
 *   或在 deploy 之后自动调用
 */

const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");
const OUTPUT_DIR = path.resolve(__dirname, "../abis");

/** 需要导出 ABI 的合约（Agent 可能调用的） */
const CONTRACTS = [
  // 核心合约
  "Register",
  "LingShi",
  "GameConfig",
  "Treasury",
  "Cultivation",
  "Hunt",
  "Treasure",
  "CaveHeaven",
  "Equipment",
  "Beast",
  "Sect",
  "Tao",
  "Battle",
  "SecretRealm",
  "Market",
  "Pill",
  "Alchemy",
  "Paymaster",
  "GameAccountFactory",
  "GameAccount",
];

function main() {
  // 确认 artifacts 存在
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    console.error("Error: artifacts/ not found. Run `npx hardhat compile` first.");
    process.exit(1);
  }

  // 创建输出目录
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let exported = 0;
  const manifest: Record<string, string> = {};

  for (const name of CONTRACTS) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);

    if (!fs.existsSync(artifactPath)) {
      console.warn(`  SKIP: ${name} (artifact not found)`);
      continue;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abi = artifact.abi;

    if (!abi || !Array.isArray(abi)) {
      console.warn(`  SKIP: ${name} (no ABI array)`);
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
    manifest[name] = `${name}.json`;
    exported++;
    console.log(`  ✓ ${name} (${abi.length} entries)`);
  }

  // 写入 manifest
  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        contracts: manifest,
      },
      null,
      2,
    ),
  );

  console.log(`\nExported ${exported}/${CONTRACTS.length} ABIs to abis/`);
  console.log(`Manifest: ${manifestPath}`);
}

main();
