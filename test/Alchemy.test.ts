import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Pill,
  Equipment,
  Treasury,
  Alchemy,
} from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, player1, player2] =
    await ethers.getSigners();

  // GameConfig
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await upgrades.deployProxy(ConfigFactory, [owner.address], {
    kind: "uups",
  });
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
    owner.address
  )) as Treasury;

  // Register
  const RegisterFactory = await ethers.getContractFactory("Register");
  const register = (await RegisterFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress()
  )) as Register;

  // Equipment
  const EquipmentFactory = await ethers.getContractFactory("Equipment");
  const equipment = (await EquipmentFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Equipment;

  // Pill
  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // Alchemy
  const AlchemyFactory = await ethers.getContractFactory("Alchemy");
  const alchemy = (await AlchemyFactory.deploy(
    await lingshi.getAddress(),
    await pill.getAddress(),
    await treasury.getAddress(),
    await equipment.getAddress(),
    await register.getAddress()
  )) as Alchemy;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, owner.address); // for test minting
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Pill MINTER_ROLE for Alchemy
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await alchemy.getAddress());

  // Equipment GAME_CONTRACT_ROLE for Alchemy (to consumeMaterials)
  const GAME_CONTRACT_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(GAME_CONTRACT_ROLE, await alchemy.getAddress());
  await equipment.grantRole(GAME_CONTRACT_ROLE, owner.address); // for test material setup

  // Treasury authorized caller for Alchemy
  await treasury.setAuthorizedCaller(await alchemy.getAddress(), true);

  // Register player1 (草莽)
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  // Give player1 灵石 and 灵材
  await lingshi.mint(player1.address, ethers.parseEther("5000"));
  await equipment.addMaterials(player1.address, 500);

  // Approve alchemy to spend player1's LS
  await lingshi
    .connect(player1)
    .approve(await alchemy.getAddress(), ethers.MaxUint256);

  return {
    config,
    lingshi,
    treasury,
    register,
    equipment,
    pill,
    alchemy,
    owner,
    devWallet,
    foundationWallet,
    player1,
    player2,
  };
}

describe("Alchemy", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { alchemy, lingshi, pill, treasury, equipment, register } =
        await loadFixture(deployFixture);
      expect(await alchemy.lingshi()).to.equal(await lingshi.getAddress());
      expect(await alchemy.pill()).to.equal(await pill.getAddress());
      expect(await alchemy.treasury()).to.equal(await treasury.getAddress());
      expect(await alchemy.equipment()).to.equal(
        await equipment.getAddress()
      );
      expect(await alchemy.register()).to.equal(
        await register.getAddress()
      );
    });

    it("should set correct initial recipes", async function () {
      const { alchemy } = await loadFixture(deployFixture);

      // 筑基丹
      const r0 = await alchemy.getRecipe(0);
      expect(r0.outputPillType).to.equal(0);
      expect(r0.lsCost).to.equal(ethers.parseEther("200"));
      expect(r0.materialCount).to.equal(10);
      expect(r0.successRateBP).to.equal(8000);
      expect(r0.realmRequired).to.equal(0);

      // 化神丹
      const r3 = await alchemy.getRecipe(3);
      expect(r3.lsCost).to.equal(ethers.parseEther("10000"));
      expect(r3.materialCount).to.equal(200);
      expect(r3.successRateBP).to.equal(4000);
      expect(r3.realmRequired).to.equal(3);
    });

    it("should set failRefundBP to 30%", async function () {
      const { alchemy } = await loadFixture(deployFixture);
      expect(await alchemy.failRefundBP()).to.equal(3000);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Alchemy");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Alchemy: zero lingshi");
    });
  });

  describe("brew", function () {
    it("should brew 筑基丹 successfully (when roll succeeds)", async function () {
      const { alchemy, pill, lingshi, equipment, player1 } =
        await loadFixture(deployFixture);

      const lsBefore = await lingshi.balanceOf(player1.address);
      const matBefore = await equipment.getSpiritMaterials(player1.address);

      // Brew 筑基丹 (recipeId=0, 200 LS, 10 materials, 80% success)
      // We can't control randomness, but we can verify the event fires
      await expect(alchemy.connect(player1).brew(0))
        .to.emit(alchemy, "BrewAttempted");

      const lsAfter = await lingshi.balanceOf(player1.address);
      const matAfter = await equipment.getSpiritMaterials(player1.address);

      // LS should decrease by 200 (or get partial refund if failed)
      expect(lsBefore - lsAfter).to.be.gte(ethers.parseEther("140")); // at least 200*0.7 consumed
      // Materials always consumed
      expect(matBefore - matAfter).to.equal(500n - 490n); // 10 consumed
    });

    it("should consume materials regardless of success", async function () {
      const { alchemy, equipment, player1 } =
        await loadFixture(deployFixture);

      const matBefore = await equipment.getSpiritMaterials(player1.address);
      await alchemy.connect(player1).brew(0);
      const matAfter = await equipment.getSpiritMaterials(player1.address);

      expect(matBefore - matAfter).to.equal(10n);
    });

    it("should reject unregistered player", async function () {
      const { alchemy, player2 } = await loadFixture(deployFixture);
      await expect(
        alchemy.connect(player2).brew(0)
      ).to.be.revertedWith("Alchemy: not registered");
    });

    it("should reject insufficient LS", async function () {
      const { alchemy, lingshi, player1 } = await loadFixture(deployFixture);

      // Transfer away most LS
      await lingshi
        .connect(player1)
        .transfer(
          (await ethers.getSigners())[0].address,
          ethers.parseEther("4900")
        );

      // Only ~120 LS left (initial 20 + 5000 - 4900), need 200
      await expect(
        alchemy.connect(player1).brew(0)
      ).to.be.revertedWith("Alchemy: insufficient LS");
    });

    it("should reject insufficient materials", async function () {
      const { alchemy, equipment, player1, owner } =
        await loadFixture(deployFixture);

      // Consume most materials
      await equipment.consumeMaterials(player1.address, 495);

      // Only 5 materials left, need 10
      await expect(
        alchemy.connect(player1).brew(0)
      ).to.be.revertedWith("Alchemy: insufficient materials");
    });

    it("should reject invalid recipe", async function () {
      const { alchemy, player1 } = await loadFixture(deployFixture);
      await expect(
        alchemy.connect(player1).brew(8)
      ).to.be.revertedWith("Alchemy: invalid recipe");
    });

    it("should reject realm too low for 结丹丹 (needs 筑基)", async function () {
      const { alchemy, player1 } = await loadFixture(deployFixture);
      // player1 is 练气, 结丹丹 requires 筑基 (realm >= 1)
      await expect(
        alchemy.connect(player1).brew(1)
      ).to.be.revertedWith("Alchemy: realm too low");
    });

    it("should brew multiple times", async function () {
      const { alchemy, player1 } = await loadFixture(deployFixture);

      // Brew 培元丹 (30 LS, 3 materials, 90% success) multiple times
      await alchemy.connect(player1).brew(4);
      await alchemy.connect(player1).brew(4);
      await alchemy.connect(player1).brew(4);

      // 3 attempts, materials consumed: 3 × 3 = 9
    });
  });

  describe("Admin setters", function () {
    it("should update recipe", async function () {
      const { alchemy, owner } = await loadFixture(deployFixture);

      await expect(alchemy.setRecipe(0, ethers.parseEther("300"), 15, 7500, 0))
        .to.emit(alchemy, "RecipeUpdated")
        .withArgs(0, ethers.parseEther("300"), 15, 7500, 0);

      const r = await alchemy.getRecipe(0);
      expect(r.lsCost).to.equal(ethers.parseEther("300"));
      expect(r.materialCount).to.equal(15);
      expect(r.successRateBP).to.equal(7500);
    });

    it("should update failRefundBP", async function () {
      const { alchemy } = await loadFixture(deployFixture);

      await expect(alchemy.setFailRefundBP(5000))
        .to.emit(alchemy, "FailRefundBPUpdated")
        .withArgs(3000, 5000);

      expect(await alchemy.failRefundBP()).to.equal(5000);
    });

    it("should reject non-owner setRecipe", async function () {
      const { alchemy, player1 } = await loadFixture(deployFixture);
      await expect(
        alchemy.connect(player1).setRecipe(0, 100, 5, 9000, 0)
      ).to.be.revertedWith("Alchemy: not owner");
    });

    it("should reject invalid recipe index", async function () {
      const { alchemy } = await loadFixture(deployFixture);
      await expect(
        alchemy.setRecipe(8, 100, 5, 9000, 0)
      ).to.be.revertedWith("Alchemy: invalid recipe");
    });

    it("should reject success rate > 100%", async function () {
      const { alchemy } = await loadFixture(deployFixture);
      await expect(
        alchemy.setRecipe(0, 100, 5, 10001, 0)
      ).to.be.revertedWith("Alchemy: rate > 100%");
    });

    it("should reject failRefundBP > 100%", async function () {
      const { alchemy } = await loadFixture(deployFixture);
      await expect(
        alchemy.setFailRefundBP(10001)
      ).to.be.revertedWith("Alchemy: refund > 100%");
    });

    it("should transfer ownership", async function () {
      const { alchemy, player1 } = await loadFixture(deployFixture);

      await alchemy.transferOwnership(player1.address);
      expect(await alchemy.owner()).to.equal(player1.address);

      // Old owner can no longer set
      await expect(
        alchemy.setFailRefundBP(1000)
      ).to.be.revertedWith("Alchemy: not owner");
    });
  });

  describe("Equipment materials integration", function () {
    it("should add materials via Equipment", async function () {
      const { equipment, player1, owner } = await loadFixture(deployFixture);

      const before = await equipment.getSpiritMaterials(player1.address);
      await equipment.addMaterials(player1.address, 100);
      const after = await equipment.getSpiritMaterials(player1.address);

      expect(after - before).to.equal(100n);
    });

    it("should consume materials via Equipment", async function () {
      const { equipment, player1, owner } = await loadFixture(deployFixture);

      const before = await equipment.getSpiritMaterials(player1.address);
      await equipment.consumeMaterials(player1.address, 50);
      const after = await equipment.getSpiritMaterials(player1.address);

      expect(before - after).to.equal(50n);
    });

    it("should reject consume with insufficient materials", async function () {
      const { equipment, player1 } = await loadFixture(deployFixture);

      await expect(
        equipment.consumeMaterials(player1.address, 9999)
      ).to.be.revertedWith("Equipment: insufficient materials");
    });
  });
});
