#!/usr/bin/env python3
"""
Etherscan V2 API 批量合约验证脚本

使用 standard-json-input 格式，通过 Etherscan V2 统一 API 验证 BSC Testnet 合约。

使用方法：
    python3 scripts/verify-etherscan-v2.py

依赖：
    - Python 3.8+
    - requests (pip install requests)
    - .env 中配置 BSCSCAN_API_KEY
"""

import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("需要 requests 库: pip install requests")
    sys.exit(1)

# ──── 配置 ────

# 从 .env 加载
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.environ.get("BSCSCAN_API_KEY", "")
if not API_KEY:
    print("Error: BSCSCAN_API_KEY not set in .env")
    sys.exit(1)

# Etherscan V2 统一端点（注意：V2 路径是 /v2/api，不是 V1 的 /api）
API_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID = 97  # BSC Testnet

DEPLOYER = "0xFE4E5536cDF3D65871Cb009E257286b2752A2f7C"
COMPILER_VERSION = "v0.8.24+commit.e11b9ed9"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# 部署地址
ADDRESSES = json.loads((PROJECT_ROOT / "deployments" / "bsc-testnet.json").read_text())

# ──── 合约列表（名称, 地址, 构造函数 ABI 编码参数） ────

def addr(name: str) -> str:
    return ADDRESSES[name]

def encode_address(a: str) -> str:
    """ABI encode an address (32 bytes, left-padded)."""
    return a.lower().replace("0x", "").zfill(64)

def encode_constructor(*args: str) -> str:
    """Concatenate ABI-encoded address arguments."""
    return "".join(encode_address(a) for a in args)


# 合约验证清单：(display_name, contract_path:contract_name, address, constructor_args_hex)
# 注意：UUPS proxy (GameConfig) 需要验证 implementation 地址
CONTRACTS = [
    # Phase 1: ZK Verifiers (无构造参数) — 这些在独立 build-info 中
    # Phase 2
    ("LingShi", "contracts/LingShi.sol:LingShi", addr("lingshi"),
     encode_constructor(DEPLOYER)),

    ("Groth16Verifier", "contracts/Groth16Verifier.sol:Groth16Verifier", addr("groth16Verifier"),
     encode_constructor(addr("battleVerifier"), addr("huntVerifier"),
                        addr("beastCaptureVerifier"), addr("realmVerifier"),
                        addr("dualHuntVerifier"))),

    # Phase 3
    ("Treasury", "contracts/Treasury.sol:Treasury", addr("treasury"),
     encode_constructor(addr("lingshi"), addr("gameConfig"),
                        DEPLOYER, DEPLOYER, DEPLOYER)),

    ("Register", "contracts/Register.sol:Register", addr("register"),
     encode_constructor(addr("lingshi"), addr("gameConfig"))),

    # Phase 4
    ("Cultivation", "contracts/Cultivation.sol:Cultivation", addr("cultivation"),
     encode_constructor(addr("lingshi"), addr("gameConfig"), addr("treasury"), addr("register"))),

    ("Hunt", "contracts/Hunt.sol:Hunt", addr("hunt"),
     encode_constructor(addr("lingshi"), addr("gameConfig"), addr("treasury"), addr("register"))),

    ("Treasure", "contracts/Treasure.sol:Treasure", addr("treasure"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("CaveHeaven", "contracts/CaveHeaven.sol:CaveHeaven", addr("caveHeaven"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("Equipment", "contracts/Equipment.sol:Equipment", addr("equipment"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("Beast", "contracts/Beast.sol:Beast", addr("beast"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("Sect", "contracts/Sect.sol:Sect", addr("sect"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("Tao", "contracts/Tao.sol:Tao", addr("tao"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"))),

    ("Market", "contracts/Market.sol:Market", addr("market"),
     encode_constructor(addr("lingshi"), addr("treasury"))),

    # Phase 5
    ("Battle", "contracts/Battle.sol:Battle", addr("battle"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"),
                        addr("gameConfig"), addr("equipment"), addr("beast"),
                        addr("caveHeaven"))),

    ("SecretRealm", "contracts/SecretRealm.sol:SecretRealm", addr("secretRealm"),
     encode_constructor(addr("lingshi"), addr("treasury"), addr("register"),
                        addr("gameConfig"), addr("equipment"), addr("beast"))),
]


def find_build_info(contract_source: str) -> dict | None:
    """Find the build-info JSON that contains the given contract source."""
    build_info_dir = PROJECT_ROOT / "artifacts" / "build-info"
    source_path = contract_source.split(":")[0]  # e.g. "contracts/LingShi.sol"

    for f in build_info_dir.glob("*.json"):
        data = json.loads(f.read_text())
        if source_path in data.get("input", {}).get("sources", {}):
            return data
    return None


def submit_verification(name: str, contract_fqn: str, address: str,
                        constructor_args: str) -> str | None:
    """Submit verification request, return GUID on success."""
    build_info = find_build_info(contract_fqn)
    if not build_info:
        print(f"  ERROR: build-info not found for {contract_fqn}")
        return None

    # standard-json-input 格式
    source_code = json.dumps(build_info["input"])

    params = {
        "apikey": API_KEY,
        "chainid": CHAIN_ID,
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": address,
        "sourceCode": source_code,
        "codeformat": "solidity-standard-json-input",
        "contractname": contract_fqn,
        "compilerversion": COMPILER_VERSION,
        "optimizationUsed": "1",
        "runs": "200",
        "constructorArguements": constructor_args,  # Etherscan 拼写就是 Arguements
        "evmVersion": "cancun",
        "licenseType": "3",  # MIT
    }

    # chainid 必须在 URL query string 中，不能在 POST body 中
    url = f"{API_URL}?chainid={CHAIN_ID}"
    resp = requests.post(url, data=params, timeout=60)
    result = resp.json()

    if result.get("status") == "1":
        guid = result["result"]
        print(f"  Submitted: GUID={guid}")
        return guid
    else:
        msg = result.get("result", result.get("message", "unknown error"))
        if "Already Verified" in str(msg):
            print(f"  Already verified")
            return "ALREADY"
        print(f"  ERROR: {msg}")
        return None


def check_status(guid: str) -> str:
    """Check verification status. Returns 'Pass', 'Fail', or 'Pending'."""
    params = {
        "apikey": API_KEY,
        "chainid": CHAIN_ID,
        "module": "contract",
        "action": "checkverifystatus",
        "guid": guid,
    }
    url = f"{API_URL}?chainid={CHAIN_ID}"
    resp = requests.get(url, params=params, timeout=30)
    result = resp.json()
    return result.get("result", "Unknown")


def main():
    print(f"Etherscan V2 批量验证 — BSC Testnet (chainId={CHAIN_ID})")
    print(f"API Key: {API_KEY[:6]}...{API_KEY[-4:]}")
    print(f"Compiler: {COMPILER_VERSION}")
    print(f"Contracts: {len(CONTRACTS)}")
    print()

    guids: list[tuple[str, str]] = []  # (name, guid)

    for name, contract_fqn, address, constructor_args in CONTRACTS:
        print(f"[{name}] {address}")
        guid = submit_verification(name, contract_fqn, address, constructor_args)
        if guid and guid != "ALREADY":
            guids.append((name, guid))
        time.sleep(1)  # rate limit

    # 等待验证结果
    if guids:
        print(f"\n=== 等待验证结果（{len(guids)} 个）===")
        time.sleep(5)

        for name, guid in guids:
            for attempt in range(10):
                status = check_status(guid)
                if "Pending" in status:
                    time.sleep(3)
                    continue
                elif "Pass" in status:
                    print(f"  ✓ {name}: Verified")
                    break
                else:
                    print(f"  ✗ {name}: {status}")
                    break
            else:
                print(f"  ? {name}: Still pending after 30s")
            time.sleep(0.5)

    print("\n=== 验证完成 ===")
    print(f"查看: https://testnet.bscscan.com/address/{addr('lingshi')}#code")


if __name__ == "__main__":
    main()
