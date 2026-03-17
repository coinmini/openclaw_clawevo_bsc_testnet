import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { GameConfig } from "../typechain-types";

async function deployFixture() {
  const [owner, other] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("GameConfig");
  const proxy = await upgrades.deployProxy(Factory, [owner.address], {
    kind: "uups",
  });
  const config = proxy as unknown as GameConfig;
  return { config, owner, other };
}

describe("GameConfig", function () {
  describe("Initialization", function () {
    it("should set default kRatioBP to 6000", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.kRatioBP()).to.equal(6000);
    });

    it("should set default restraintBaseBP to 13000", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.restraintBaseBP()).to.equal(13000);
    });

    it("should set default generationBP to 10800", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.generationBP()).to.equal(10800);
    });

    it("should set default treasury ratios (50/25/25)", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.burnRatioBP()).to.equal(5000);
      expect(await config.devRatioBP()).to.equal(2500);
      expect(await config.foundationRatioBP()).to.equal(2500);
    });

    it("should set default initialLingShi to 20 ether", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.initialLingShi()).to.equal(ethers.parseEther("20"));
    });

    it("should set default blockDelayWindow to 256", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.blockDelayWindow()).to.equal(256);
    });

    it("should set perception thresholds [0, 250, 500, 750]", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.perceptionThreshold(0)).to.equal(0);
      expect(await config.perceptionThreshold(1)).to.equal(250);
      expect(await config.perceptionThreshold(2)).to.equal(500);
      expect(await config.perceptionThreshold(3)).to.equal(750);
    });

    it("should set perception bonuses [0, 500, 1000, 1500] bp", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.perceptionBonusBP(0)).to.equal(0);
      expect(await config.perceptionBonusBP(1)).to.equal(500);
      expect(await config.perceptionBonusBP(2)).to.equal(1000);
      expect(await config.perceptionBonusBP(3)).to.equal(1500);
    });

    it("should set heart thresholds [1000, 3000]", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.heartThreshold(0)).to.equal(1000);
      expect(await config.heartThreshold(1)).to.equal(3000);
    });

    it("should set fortune thresholds [1000, 3000]", async function () {
      const { config } = await loadFixture(deployFixture);
      expect(await config.fortuneThreshold(0)).to.equal(1000);
      expect(await config.fortuneThreshold(1)).to.equal(3000);
    });

    it("should revert on invalid perception tier", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.perceptionThreshold(4)).to.be.revertedWith(
        "GameConfig: invalid tier"
      );
    });

    it("should revert on invalid heart tier", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.heartThreshold(2)).to.be.revertedWith(
        "GameConfig: invalid tier"
      );
    });

    it("should revert initialize with zero address", async function () {
      const Factory = await ethers.getContractFactory("GameConfig");
      await expect(
        upgrades.deployProxy(Factory, [ethers.ZeroAddress], { kind: "uups" })
      ).to.be.revertedWith("GameConfig: zero address");
    });
  });

  describe("Setters", function () {
    it("should allow owner to set kRatio", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setKRatio(8000))
        .to.emit(config, "KRatioUpdated")
        .withArgs(6000, 8000);
      expect(await config.kRatioBP()).to.equal(8000);
    });

    it("should reject kRatio below 3000", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setKRatio(2999)).to.be.revertedWith(
        "GameConfig: kRatio out of range"
      );
    });

    it("should reject kRatio above 15000", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setKRatio(15001)).to.be.revertedWith(
        "GameConfig: kRatio out of range"
      );
    });

    it("should allow kRatio at boundary values", async function () {
      const { config } = await loadFixture(deployFixture);
      await config.setKRatio(3000);
      expect(await config.kRatioBP()).to.equal(3000);
      await config.setKRatio(15000);
      expect(await config.kRatioBP()).to.equal(15000);
    });

    it("should allow owner to set restraintBase", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setRestraintBase(14000))
        .to.emit(config, "RestraintBaseUpdated")
        .withArgs(13000, 14000);
    });

    it("should reject restraintBase out of range", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setRestraintBase(9999)).to.be.revertedWith(
        "GameConfig: restraint out of range"
      );
      await expect(config.setRestraintBase(20001)).to.be.revertedWith(
        "GameConfig: restraint out of range"
      );
    });

    it("should allow owner to set generation", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setGeneration(11000))
        .to.emit(config, "GenerationUpdated")
        .withArgs(10800, 11000);
    });

    it("should reject generation out of range", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setGeneration(9999)).to.be.revertedWith(
        "GameConfig: generation out of range"
      );
    });

    it("should allow owner to set treasury ratios summing to 10000", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setTreasuryRatios(6000, 2000, 2000))
        .to.emit(config, "TreasuryRatiosUpdated")
        .withArgs(6000, 2000, 2000);
      expect(await config.burnRatioBP()).to.equal(6000);
      expect(await config.devRatioBP()).to.equal(2000);
      expect(await config.foundationRatioBP()).to.equal(2000);
    });

    it("should reject treasury ratios not summing to 10000", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setTreasuryRatios(5000, 3000, 3000)).to.be.revertedWith(
        "GameConfig: ratios must sum to 10000"
      );
    });

    it("should allow owner to set initialLingShi", async function () {
      const { config } = await loadFixture(deployFixture);
      const newAmount = ethers.parseEther("50");
      await expect(config.setInitialLingShi(newAmount))
        .to.emit(config, "InitialLingShiUpdated")
        .withArgs(ethers.parseEther("20"), newAmount);
    });

    it("should reject initialLingShi too large", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(
        config.setInitialLingShi(ethers.parseEther("1001"))
      ).to.be.revertedWith("GameConfig: initialLingShi too large");
    });

    it("should allow owner to set blockDelayWindow", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setBlockDelayWindow(128))
        .to.emit(config, "BlockDelayWindowUpdated")
        .withArgs(256, 128);
    });

    it("should reject blockDelayWindow out of range", async function () {
      const { config } = await loadFixture(deployFixture);
      await expect(config.setBlockDelayWindow(0)).to.be.revertedWith(
        "GameConfig: window out of range"
      );
      await expect(config.setBlockDelayWindow(257)).to.be.revertedWith(
        "GameConfig: window out of range"
      );
    });
  });

  describe("Access Control", function () {
    it("should reject non-owner setter calls", async function () {
      const { config, other } = await loadFixture(deployFixture);
      const connected = config.connect(other);

      await expect(connected.setKRatio(8000)).to.be.revertedWithCustomError(
        config,
        "OwnableUnauthorizedAccount"
      );
      await expect(connected.setRestraintBase(14000)).to.be.revertedWithCustomError(
        config,
        "OwnableUnauthorizedAccount"
      );
      await expect(connected.setGeneration(11000)).to.be.revertedWithCustomError(
        config,
        "OwnableUnauthorizedAccount"
      );
      await expect(
        connected.setTreasuryRatios(6000, 2000, 2000)
      ).to.be.revertedWithCustomError(config, "OwnableUnauthorizedAccount");
      await expect(
        connected.setInitialLingShi(ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(config, "OwnableUnauthorizedAccount");
      await expect(connected.setBlockDelayWindow(128)).to.be.revertedWithCustomError(
        config,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("UUPS Upgrade", function () {
    it("should allow owner to upgrade", async function () {
      const { config, owner } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("GameConfig");
      const upgraded = await upgrades.upgradeProxy(
        await config.getAddress(),
        Factory
      );
      expect(await upgraded.kRatioBP()).to.equal(6000);
    });

    it("should reject non-owner upgrade", async function () {
      const { config, other } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("GameConfig", other);
      await expect(
        upgrades.upgradeProxy(await config.getAddress(), Factory)
      ).to.be.revertedWithCustomError(config, "OwnableUnauthorizedAccount");
    });
  });
});
