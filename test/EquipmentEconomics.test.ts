import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Treasury,
  Equipment,
} from "../typechain-types";

/**
 * EquipmentEconomics — 装备经济循环测试
 *
 * 1. 强化 LS 流向：player → Treasury → 50%burn/25%dev/25%foundation
 * 2. 强化全梯度费用：+0→+5 累计 620 LS
 * 3. 升品 LS 流向验证
 * 4. 分解返还：白品 → 1 LS + 2 灵材
 * 5. 分解强化物品的灵材返还
 * 6. 完整生命周期：mint → equip → enhance → unequip → decompose
 * 7. Treasury 50/25/25 分成验证
 */

async function deployFixture() {
  const [owner, devWallet, foundationWallet, player1] =
    await ethers.getSigners();

  // GameConfig
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await (await import("hardhat")).upgrades.deployProxy(
    ConfigFactory,
    [owner.address],
    { kind: "uups" },
  );
  const config = configProxy as unknown as GameConfig;

  // LingShi
  const LingShiFactory = await ethers.getContractFactory("LingShi");
  const lingshi = (await LingShiFactory.deploy(owner.address)) as LingShi;

  // Treasury
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = (await TreasuryFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress(),
    devWallet.address,
    foundationWallet.address,
    owner.address,
  )) as Treasury;

  // Register
  const RegisterFactory = await ethers.getContractFactory("Register");
  const register = (await RegisterFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress(),
  )) as Register;

  // Equipment
  const EquipmentFactory = await ethers.getContractFactory("Equipment");
  const equipment = (await EquipmentFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
  )) as Equipment;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await equipment.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize equipment on treasury
  await treasury.setAuthorizedCaller(await equipment.getAddress(), true);

  // Grant GAME_CONTRACT_ROLE
  const GAME_CONTRACT_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(GAME_CONTRACT_ROLE, owner.address);

  // Register player1
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  // Give player LS and approve equipment
  await lingshi.mint(player1.address, ethers.parseEther("100000"));
  await lingshi
    .connect(player1)
    .approve(await equipment.getAddress(), ethers.MaxUint256);

  return {
    config, lingshi, treasury, register, equipment,
    owner, devWallet, foundationWallet, player1,
  };
}

const ENHANCE_COSTS = [20, 50, 100, 150, 300]; // LS per level
const TOTAL_ENHANCE_COST = ENHANCE_COSTS.reduce((a, b) => a + b, 0); // 620

describe("EquipmentEconomics", function () {
  describe("Enhance costs", function () {
    it("should deduct correct LS for each enhance level", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      // Mint a WHITE weapon
      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      for (let level = 0; level < 5; level++) {
        const balBefore = await lingshi.balanceOf(player1.address);
        await equipment.connect(player1).enhance(1);
        const balAfter = await lingshi.balanceOf(player1.address);

        const spent = balBefore - balAfter;
        expect(spent).to.equal(
          ethers.parseEther(String(ENHANCE_COSTS[level])),
          `Level +${level} → +${level + 1} should cost ${ENHANCE_COSTS[level]} LS`,
        );
      }

      // Verify final enhance level
      const data = await equipment.getEquipmentData(1);
      expect(data.enhanceLevel).to.equal(5);
    });

    it("cumulative enhance cost +0→+5 should be 620 LS", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      const balBefore = await lingshi.balanceOf(player1.address);
      for (let i = 0; i < 5; i++) {
        await equipment.connect(player1).enhance(1);
      }
      const balAfter = await lingshi.balanceOf(player1.address);

      expect(balBefore - balAfter).to.equal(
        ethers.parseEther(String(TOTAL_ENHANCE_COST)),
      );
    });

    it("should revert when trying to enhance beyond max level", async function () {
      const { equipment, player1, owner } = await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      // Enhance to +5
      for (let i = 0; i < 5; i++) {
        await equipment.connect(player1).enhance(1);
      }

      // Level 6 should fail
      await expect(
        equipment.connect(player1).enhance(1),
      ).to.be.revertedWith("Equipment: max enhance");
    });
  });

  describe("Decompose returns", function () {
    it("WHITE decompose → 1 LS + 2 materials", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      const balBefore = await lingshi.balanceOf(player1.address);
      const matBefore = await equipment.getSpiritMaterials(player1.address);

      await equipment.connect(player1).decompose(1);

      const balAfter = await lingshi.balanceOf(player1.address);
      const matAfter = await equipment.getSpiritMaterials(player1.address);

      expect(balAfter - balBefore).to.equal(ethers.parseEther("1"));
      expect(matAfter - matBefore).to.equal(2);
    });

    it("GREEN decompose → 3 LS + 6 materials", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 1, 1000, 0, 0, 0);

      const balBefore = await lingshi.balanceOf(player1.address);
      const matBefore = await equipment.getSpiritMaterials(player1.address);

      await equipment.connect(player1).decompose(1);

      expect(await lingshi.balanceOf(player1.address) - balBefore).to.equal(
        ethers.parseEther("3"),
      );
      expect(await equipment.getSpiritMaterials(player1.address) - matBefore).to.equal(6);
    });

    it("BLUE decompose → 10 LS + 15 materials", async function () {
      const { equipment, lingshi, player1, owner, register } =
        await loadFixture(deployFixture);

      // Need realm ≥ 筑基 for BLUE
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateRealm(player1.address, 1);

      await equipment.connect(owner).mint(player1.address, 0, 2, 1500, 0, 0, 0);

      const balBefore = await lingshi.balanceOf(player1.address);
      await equipment.connect(player1).decompose(1);

      expect(await lingshi.balanceOf(player1.address) - balBefore).to.equal(
        ethers.parseEther("10"),
      );
      expect(await equipment.getSpiritMaterials(player1.address)).to.equal(15);
    });

    it("PURPLE decompose → 30 LS + 40 materials", async function () {
      const { equipment, lingshi, player1, owner, register } =
        await loadFixture(deployFixture);

      // Need realm ≥ 金丹 for PURPLE
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateRealm(player1.address, 2);

      await equipment.connect(owner).mint(player1.address, 0, 3, 2000, 0, 0, 0);

      const balBefore = await lingshi.balanceOf(player1.address);
      await equipment.connect(player1).decompose(1);

      expect(await lingshi.balanceOf(player1.address) - balBefore).to.equal(
        ethers.parseEther("30"),
      );
      expect(await equipment.getSpiritMaterials(player1.address)).to.equal(40);
    });
  });

  describe("Decompose enhanced item returns extra materials", function () {
    it("+3 WHITE decompose → extra materials from enhance", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      // Enhance to +3
      for (let i = 0; i < 3; i++) {
        await equipment.connect(player1).enhance(1);
      }

      const matBefore = await equipment.getSpiritMaterials(player1.address);
      await equipment.connect(player1).decompose(1);
      const matAfter = await equipment.getSpiritMaterials(player1.address);

      // Base 2 + enhanceLevel*2 = 2 + 6 = 8
      expect(matAfter - matBefore).to.equal(8);
    });
  });

  describe("Treasury fee split", function () {
    it("enhance fee should flow through treasury (50% burn)", async function () {
      const { equipment, lingshi, treasury, player1, owner } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      const totalSupplyBefore = await lingshi.totalSupply();

      // Enhance once: costs 20 LS
      await equipment.connect(player1).enhance(1);

      // Treasury distributes: 50% burn = 10 LS burned
      const totalSupplyAfter = await lingshi.totalSupply();

      // Player spent 20 LS, 10 LS burned from total supply
      // The remaining 10 LS goes to dev (5) + foundation (5)
      const burned = totalSupplyBefore - totalSupplyAfter;
      // Note: player spent 20 LS (totalSupply unchanged by transfer),
      // then treasury burns 50% = 10 LS from the 20 LS it received
      expect(burned).to.equal(ethers.parseEther("10"));
    });

    it("enhance fee 25% goes to dev wallet", async function () {
      const { equipment, lingshi, player1, owner, devWallet } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      const devBefore = await lingshi.balanceOf(devWallet.address);
      await equipment.connect(player1).enhance(1); // 20 LS cost
      const devAfter = await lingshi.balanceOf(devWallet.address);

      // 25% of 20 = 5 LS to dev
      expect(devAfter - devBefore).to.equal(ethers.parseEther("5"));
    });

    it("enhance fee 25% goes to foundation wallet", async function () {
      const { equipment, lingshi, player1, owner, foundationWallet } =
        await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);

      const foundBefore = await lingshi.balanceOf(foundationWallet.address);
      await equipment.connect(player1).enhance(1); // 20 LS cost
      const foundAfter = await lingshi.balanceOf(foundationWallet.address);

      // 25% of 20 = 5 LS to foundation
      expect(foundAfter - foundBefore).to.equal(ethers.parseEther("5"));
    });
  });

  describe("Full lifecycle", function () {
    it("mint → equip → enhance → unequip → decompose", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      // 1. Mint
      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);
      expect(await equipment.getEquipmentData(1)).to.exist;

      // 2. Equip
      await equipment.connect(player1).equip(1);
      expect(await equipment.getEquipped(player1.address, 0)).to.equal(1);

      // 3. Enhance to +2
      await equipment.connect(player1).enhance(1);
      await equipment.connect(player1).enhance(1);
      const data = await equipment.getEquipmentData(1);
      expect(data.enhanceLevel).to.equal(2);

      // 4. Unequip
      await equipment.connect(player1).unequip(0); // WEAPON slot
      expect(await equipment.getEquipped(player1.address, 0)).to.equal(0);

      // 5. Decompose
      const balBefore = await lingshi.balanceOf(player1.address);
      await equipment.connect(player1).decompose(1);
      const balAfter = await lingshi.balanceOf(player1.address);

      // Should get 1 LS back (WHITE decompose refund)
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1"));

      // Should get 2 + 2*2 = 6 materials (base + enhance bonus)
      expect(await equipment.getSpiritMaterials(player1.address)).to.equal(6);
    });

    it("cannot decompose equipped item", async function () {
      const { equipment, player1, owner } = await loadFixture(deployFixture);

      await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).equip(1);

      await expect(
        equipment.connect(player1).decompose(1),
      ).to.be.revertedWith("Equipment: unequip first");
    });
  });

  describe("Net deflationary verification", function () {
    it("enhance costs exceed decompose returns (net LS sink)", async function () {
      const { equipment, lingshi, player1, owner } =
        await loadFixture(deployFixture);

      // Mint 3 WHITE weapons
      for (let i = 0; i < 3; i++) {
        await equipment.connect(owner).mint(player1.address, 0, 0, 500, 0, 0, 0);
      }

      const balBefore = await lingshi.balanceOf(player1.address);

      // Enhance first weapon to +5 (costs 620 LS)
      for (let i = 0; i < 5; i++) {
        await equipment.connect(player1).enhance(1);
      }

      // Decompose all 3 (returns 1 LS each = 3 LS total, but #1 has enhance bonus materials)
      await equipment.connect(player1).decompose(2);
      await equipment.connect(player1).decompose(3);
      // Must unequip if equipped — but #1 is not equipped, so decompose directly
      // Wait — enhance doesn't auto-equip. We can decompose directly.
      await equipment.connect(player1).decompose(1);

      const balAfter = await lingshi.balanceOf(player1.address);

      // Net spent: 620 (enhance) - 3 (decompose refund) = 617 LS net sink
      // Plus the burned portion from treasury
      const netSpent = balBefore - balAfter;
      expect(netSpent).to.be.gt(0n, "System should be net deflationary");
    });
  });
});
