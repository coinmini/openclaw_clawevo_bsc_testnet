#!/bin/bash
# 批量验证 BSC Testnet 合约
# 使用方法：bash scripts/verify-all.sh

set -e

NETWORK="bscTestnet"
DEPLOYER="0xFE4E5536cDF3D65871Cb009E257286b2752A2f7C"

# 合约地址
GAME_CONFIG="0x605021bE49FB6C3e327d6c1960623f2e122c7279"
BATTLE_VERIFIER="0xd53A6916239cF77Ef6E8C968e43ce92214f5a614"
HUNT_VERIFIER="0xBD1eA45AAb351Fad4Cd9e7b9628F9718E603D0d4"
BEAST_CAPTURE_VERIFIER="0xfB108821d0c0d77A91c48A99BafD2b6fa1064fB6"
REALM_VERIFIER="0x7537023AB105076E1A79dA5fcc8e40249ADbF498"
DUAL_HUNT_VERIFIER="0xcd55821C6713bd29e0E93Dd4eDAe81c6a738ACA3"
LINGSHI="0x027ae246fE9B0b766FcBD2f9c663EdED443409E3"
GROTH16_VERIFIER="0xDdb97bA9F6B72B101f8fd98dE1ed1f3b302aD435"
TREASURY="0x6b1176A40A560BDF98Fc65516fB3a8507f2415f2"
REGISTER="0xaE8Ef6361b7c7dA4B6Ef35f2906FA5056Ebb1dA5"
CULTIVATION="0x6498f6587694bAd7b4095Af610a0D15fC7dC2541"
HUNT="0xd1B0231C6DBa12Ed69E135E00883C233Cb019AfF"
TREASURE="0xFA71129e3d05E34c42387159De95f21C487926b6"
CAVE_HEAVEN="0xb228A8C1eBD42B736A922D497dF1e88f362dEB64"
EQUIPMENT="0xb9afFE276EFD2bD6B3544da5529F62a9B62d8Db7"
BEAST="0xCc83238e282b57aDfaf9101EF3833fBe650150e0"
SECT="0xFd864ffFFF7D54e12Cd0d3C34Dc2Af1110651994"
TAO="0xe3C97b506f19dbafBec8780E7B1888eB0aebc719"
MARKET="0x9cCAaCD2605Cfd784Cd449EFeD76a0e87fEc9d5B"
BATTLE="0x526692900d0d40B791bDaF449E3FdCF3bD0F843F"
SECRET_REALM="0xA683c6cACe74ef6E8701D552728f24CC285CcEA9"

verify() {
  local name=$1
  shift
  echo ""
  echo "=== Verifying $name ==="
  npx hardhat verify --network $NETWORK "$@" || echo "  ⚠ $name verification failed (may already be verified)"
  sleep 1  # rate limit: 5 calls/sec
}

# Phase 1: 无构造参数的 ZK Verifiers
verify "BattleVerifier" $BATTLE_VERIFIER
verify "HuntVerifier" $HUNT_VERIFIER
verify "BeastCaptureVerifier" $BEAST_CAPTURE_VERIFIER
verify "RealmVerifier" $REALM_VERIFIER
verify "DualHuntVerifier" $DUAL_HUNT_VERIFIER

# Phase 1: GameConfig (UUPS Proxy — 验证 implementation)
echo ""
echo "=== Verifying GameConfig (proxy) ==="
npx hardhat verify --network $NETWORK $GAME_CONFIG || echo "  ⚠ GameConfig verification failed"
sleep 1

# Phase 2: LingShi(admin)
verify "LingShi" $LINGSHI $DEPLOYER

# Phase 2: Groth16Verifier(battle, hunt, beastCapture, realm, dualHunt)
verify "Groth16Verifier" $GROTH16_VERIFIER \
  $BATTLE_VERIFIER $HUNT_VERIFIER $BEAST_CAPTURE_VERIFIER $REALM_VERIFIER $DUAL_HUNT_VERIFIER

# Phase 3: Treasury(lingshi, gameConfig, devWallet, foundationWallet, admin)
verify "Treasury" $TREASURY \
  $LINGSHI $GAME_CONFIG $DEPLOYER $DEPLOYER $DEPLOYER

# Phase 3: Register(lingshi, gameConfig)
verify "Register" $REGISTER $LINGSHI $GAME_CONFIG

# Phase 4: Cultivation(lingshi, gameConfig, treasury, register)
verify "Cultivation" $CULTIVATION $LINGSHI $GAME_CONFIG $TREASURY $REGISTER

# Phase 4: Hunt(lingshi, gameConfig, treasury, register)
verify "Hunt" $HUNT $LINGSHI $GAME_CONFIG $TREASURY $REGISTER

# Phase 4: Treasure(lingshi, treasury, register)
verify "Treasure" $TREASURE $LINGSHI $TREASURY $REGISTER

# Phase 4: CaveHeaven(lingshi, treasury, register)
verify "CaveHeaven" $CAVE_HEAVEN $LINGSHI $TREASURY $REGISTER

# Phase 4: Equipment(lingshi, treasury, register)
verify "Equipment" $EQUIPMENT $LINGSHI $TREASURY $REGISTER

# Phase 4: Beast(lingshi, treasury, register)
verify "Beast" $BEAST $LINGSHI $TREASURY $REGISTER

# Phase 4: Sect(lingshi, treasury, register)
verify "Sect" $SECT $LINGSHI $TREASURY $REGISTER

# Phase 4: Tao(lingshi, treasury, register)
verify "Tao" $TAO $LINGSHI $TREASURY $REGISTER

# Phase 4: Market(lingshi, treasury)
verify "Market" $MARKET $LINGSHI $TREASURY

# Phase 5: Battle(lingshi, treasury, register, gameConfig, equipment, beast, caveHeaven)
verify "Battle" $BATTLE \
  $LINGSHI $TREASURY $REGISTER $GAME_CONFIG $EQUIPMENT $BEAST $CAVE_HEAVEN

# Phase 5: SecretRealm(lingshi, treasury, register, gameConfig, equipment, beast)
verify "SecretRealm" $SECRET_REALM \
  $LINGSHI $TREASURY $REGISTER $GAME_CONFIG $EQUIPMENT $BEAST

echo ""
echo "=== 验证完成 ==="
