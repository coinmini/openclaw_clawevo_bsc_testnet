import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Treasury,
  CaveHeaven,
  Pill,
} from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, player1, player2, player3] =
    await ethers.getSigners();

  // GameConfig
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await (await import("hardhat")).upgrades.deployProxy(
    ConfigFactory,
    [owner.address],
    { kind: "uups" }
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
    owner.address
  )) as Treasury;

  // Register
  const RegisterFactory = await ethers.getContractFactory("Register");
  const register = (await RegisterFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress()
  )) as Register;

  // Pill
  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // CaveHeaven
  const CaveHeavenFactory = await ethers.getContractFactory("CaveHeaven");
  const caveHeaven = (await CaveHeavenFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
    await pill.getAddress()
  )) as CaveHeaven;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize caveHeaven for treasury
  await treasury.setAuthorizedCaller(await caveHeaven.getAddress(), true);

  // Pill MINTER_ROLE for CaveHeaven (to mint harvested pills)
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await caveHeaven.getAddress());

  // Allow owner to update realm (for test setup)
  await register.setAuthorizedUpdater(owner.address, true);

  // Register player1 and player2
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  await register.connect(player2).registerIntent(1, 0, "仙人");
  await mine(1);
  await register.connect(player2).finalizeRegistration();

  // Give players LS
  await lingshi.mint(player1.address, ethers.parseEther("50000"));
  await lingshi.mint(player2.address, ethers.parseEther("50000"));
  await lingshi.connect(player1).approve(await caveHeaven.getAddress(), ethers.MaxUint256);
  await lingshi.connect(player2).approve(await caveHeaven.getAddress(), ethers.MaxUint256);

  return {
    config,
    lingshi,
    treasury,
    register,
    pill,
    caveHeaven,
    owner,
    devWallet,
    foundationWallet,
    player1,
    player2,
    player3,
  };
}

// Helper: set player realm via owner
async function setRealm(register: Register, owner: any, player: string, realm: number) {
  await register.connect(owner).updateRealm(player, realm);
}

// Helper: add many cultivation hours (in real seconds, respecting 24h cap per call)
async function addManyHours(caveHeaven: CaveHeaven, caller: any, player: string, totalSeconds: number) {
  const maxPerCall = 24 * 3600; // 24h cap
  let remaining = totalSeconds;
  while (remaining > 0) {
    const chunk = remaining > maxPerCall ? maxPerCall : remaining;
    // Only add if chunk >= 4h (min session)
    if (chunk >= 4 * 3600) {
      await caveHeaven.connect(caller).addCultivationHours(player, chunk);
    }
    remaining -= chunk;
  }
}

describe("CaveHeaven", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { caveHeaven, lingshi, treasury, register } =
        await loadFixture(deployFixture);
      expect(await caveHeaven.lingshi()).to.equal(await lingshi.getAddress());
      expect(await caveHeaven.treasury()).to.equal(await treasury.getAddress());
      expect(await caveHeaven.register()).to.equal(await register.getAddress());
    });

    it("should set correct tier parameters", async function () {
      const { caveHeaven } = await loadFixture(deployFixture);
      expect(await caveHeaven.tierCosts(0)).to.equal(0);
      expect(await caveHeaven.tierCosts(1)).to.equal(ethers.parseEther("500"));
      expect(await caveHeaven.tierCosts(2)).to.equal(ethers.parseEther("2000"));
      expect(await caveHeaven.tierCosts(3)).to.equal(ethers.parseEther("8000"));
    });

    it("should set correct multipliers", async function () {
      const { caveHeaven } = await loadFixture(deployFixture);
      expect(await caveHeaven.tierMultipliers(0)).to.equal(100);
      expect(await caveHeaven.tierMultipliers(1)).to.equal(120);
      expect(await caveHeaven.tierMultipliers(2)).to.equal(140);
      expect(await caveHeaven.tierMultipliers(3)).to.equal(160);
    });

    it("should set correct maintenance fees", async function () {
      const { caveHeaven } = await loadFixture(deployFixture);
      expect(await caveHeaven.maintenanceFees(0)).to.equal(0);
      expect(await caveHeaven.maintenanceFees(1)).to.equal(ethers.parseEther("5"));
      expect(await caveHeaven.maintenanceFees(2)).to.equal(ethers.parseEther("20"));
      expect(await caveHeaven.maintenanceFees(3)).to.equal(ethers.parseEther("100"));
    });

    it("should set correct realm requirements", async function () {
      const { caveHeaven } = await loadFixture(deployFixture);
      expect(await caveHeaven.tierRealmReqs(0)).to.equal(0);
      expect(await caveHeaven.tierRealmReqs(1)).to.equal(2);
      expect(await caveHeaven.tierRealmReqs(2)).to.equal(3);
      expect(await caveHeaven.tierRealmReqs(3)).to.equal(4);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("CaveHeaven");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("CaveHeaven: zero lingshi");
    });
  });

  describe("open", function () {
    it("should open cave for 金丹 player", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);

      await setRealm(register, owner, player1.address, 2); // 金丹

      await expect(caveHeaven.connect(player1).open())
        .to.emit(caveHeaven, "CaveOpened")
        .withArgs(player1.address, ethers.parseEther("500"));

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(1); // CaveHeaven
    });

    it("should reject for unregistered player", async function () {
      const { caveHeaven, player3 } = await loadFixture(deployFixture);
      await expect(
        caveHeaven.connect(player3).open()
      ).to.be.revertedWith("CaveHeaven: not registered");
    });

    it("should reject for realm below 金丹", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      // player1 is realm 0 (练气)
      await expect(
        caveHeaven.connect(player1).open()
      ).to.be.revertedWith("CaveHeaven: realm too low");
    });

    it("should reject double open", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await expect(
        caveHeaven.connect(player1).open()
      ).to.be.revertedWith("CaveHeaven: already opened");
    });

    it("should deduct 500 LS", async function () {
      const { caveHeaven, lingshi, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);

      const balBefore = await lingshi.balanceOf(player1.address);
      await caveHeaven.connect(player1).open();
      const balAfter = await lingshi.balanceOf(player1.address);

      expect(balBefore - balAfter).to.equal(ethers.parseEther("500"));
    });
  });

  describe("upgrade", function () {
    it("should upgrade CaveHeaven → BlessedLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3); // 元婴
      await caveHeaven.connect(player1).open();

      await expect(caveHeaven.connect(player1).upgrade())
        .to.emit(caveHeaven, "CaveUpgraded");

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(2); // BlessedLand
    });

    it("should reject upgrade without cave", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      await expect(
        caveHeaven.connect(player1).upgrade()
      ).to.be.revertedWith("CaveHeaven: not opened");
    });

    it("should reject upgrade when realm too low", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2); // 金丹
      await caveHeaven.connect(player1).open();

      // Upgrading to BlessedLand requires realm 3 (元婴)
      await expect(
        caveHeaven.connect(player1).upgrade()
      ).to.be.revertedWith("CaveHeaven: realm too low");
    });

    it("should reject SpiritLand upgrade without 4000h", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 4); // 化神
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      // Try to upgrade to SpiritLand without hours
      await expect(
        caveHeaven.connect(player1).upgrade()
      ).to.be.revertedWith("CaveHeaven: insufficient hours");
    });

    it("should allow SpiritLand upgrade with 4000h", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 4);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      // Authorize owner to add hours (simulating Cultivation contract)
      await caveHeaven.setAuthorizedCaller(owner.address, true);

      // Add 4000 hours of cultivation (in 24h chunks)
      await addManyHours(caveHeaven, owner, player1.address, 4000 * 3600);

      await caveHeaven.connect(player1).upgrade(); // → SpiritLand
      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(3); // SpiritLand
    });

    it("should reject upgrade beyond SpiritLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 4);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await addManyHours(caveHeaven, owner, player1.address, 4000 * 3600);
      await caveHeaven.connect(player1).upgrade(); // → SpiritLand

      await expect(
        caveHeaven.connect(player1).upgrade()
      ).to.be.revertedWith("CaveHeaven: max tier");
    });

    it("should deduct correct upgrade costs", async function () {
      const { caveHeaven, lingshi, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open(); // -500 LS

      const balBefore = await lingshi.balanceOf(player1.address);
      await caveHeaven.connect(player1).upgrade(); // -2000 LS
      const balAfter = await lingshi.balanceOf(player1.address);

      expect(balBefore - balAfter).to.equal(ethers.parseEther("2000"));
    });
  });

  describe("payMaintenance", function () {
    it("should pay maintenance for 1 day", async function () {
      const { caveHeaven, lingshi, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      const balBefore = await lingshi.balanceOf(player1.address);
      await expect(caveHeaven.connect(player1).payMaintenance(1))
        .to.emit(caveHeaven, "MaintenancePaid");

      const balAfter = await lingshi.balanceOf(player1.address);
      expect(balBefore - balAfter).to.equal(ethers.parseEther("5"));
    });

    it("should pay maintenance for multiple days", async function () {
      const { caveHeaven, lingshi, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      const balBefore = await lingshi.balanceOf(player1.address);
      await caveHeaven.connect(player1).payMaintenance(10);
      const balAfter = await lingshi.balanceOf(player1.address);

      // 10 days × 5 LS/day = 50 LS
      expect(balBefore - balAfter).to.equal(ethers.parseEther("50"));
    });

    it("should reject zero days", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await expect(
        caveHeaven.connect(player1).payMaintenance(0)
      ).to.be.revertedWith("CaveHeaven: zero days");
    });

    it("should reject when no cave", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      await expect(
        caveHeaven.connect(player1).payMaintenance(1)
      ).to.be.revertedWith("CaveHeaven: not opened");
    });
  });

  describe("overdue & downgrade", function () {
    it("should return normal multiplier within grace period (0-3 days)", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      // Advance 2 days (within grace)
      await time.increase(2 * 86400);

      const mult = await caveHeaven.getCultivationMultiplier(player1.address);
      expect(mult).to.equal(120); // ×1.2 normal
    });

    it("should halve bonus at 4-7 days overdue", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      // Advance 5 days (past grace, within downgrade)
      await time.increase(5 * 86400);

      const mult = await caveHeaven.getCultivationMultiplier(player1.address);
      // CaveHeaven ×1.2 → bonus=20 → half=10 → ×1.1 = 110
      expect(mult).to.equal(110);
    });

    it("should halve BlessedLand bonus at 4-7 days", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      await time.increase(5 * 86400);

      const mult = await caveHeaven.getCultivationMultiplier(player1.address);
      // BlessedLand ×1.4 → bonus=40 → half=20 → ×1.2 = 120
      expect(mult).to.equal(120);
    });

    it("should show degraded multiplier after >7 days", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      await time.increase(8 * 86400);

      const mult = await caveHeaven.getCultivationMultiplier(player1.address);
      // Degraded from BlessedLand(2) → CaveHeaven(1): ×1.2 = 120
      expect(mult).to.equal(120);
    });

    it("should actually downgrade on checkAndDowngrade call", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // → BlessedLand

      await time.increase(8 * 86400);

      await expect(caveHeaven.checkAndDowngrade(player1.address))
        .to.emit(caveHeaven, "CaveDowngraded");

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(1); // CaveHeaven (downgraded from BlessedLand)
    });

    it("should close cave when CaveHeaven downgrades", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open(); // CaveHeaven

      await time.increase(8 * 86400);
      await caveHeaven.checkAndDowngrade(player1.address);

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(0); // None (closed)
    });

    it("should not downgrade within grace period", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await time.increase(3 * 86400);
      await caveHeaven.checkAndDowngrade(player1.address);

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.tier).to.equal(1); // Still CaveHeaven
    });

    it("should return 0 daoXin bonus when overdue past grace", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade(); // BlessedLand (daoXin=100)

      const bonusBefore = await caveHeaven.getDaoXinBonus(player1.address);
      expect(bonusBefore).to.equal(100);

      await time.increase(5 * 86400);

      const bonusAfter = await caveHeaven.getDaoXinBonus(player1.address);
      expect(bonusAfter).to.equal(0); // Lost bonus due to overdue
    });
  });

  describe("getCultivationMultiplier", function () {
    it("should return 100 for no cave", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      expect(await caveHeaven.getCultivationMultiplier(player1.address)).to.equal(100);
    });

    it("should return 120 for CaveHeaven", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      expect(await caveHeaven.getCultivationMultiplier(player1.address)).to.equal(120);
    });

    it("should return 140 for BlessedLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade();

      expect(await caveHeaven.getCultivationMultiplier(player1.address)).to.equal(140);
    });

    it("should return 160 for SpiritLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 4);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await addManyHours(caveHeaven, owner, player1.address, 4000 * 3600);
      await caveHeaven.connect(player1).upgrade();

      expect(await caveHeaven.getCultivationMultiplier(player1.address)).to.equal(160);
    });
  });

  describe("getDaoXinBonus", function () {
    it("should return 0 for no cave", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      expect(await caveHeaven.getDaoXinBonus(player1.address)).to.equal(0);
    });

    it("should return 0 for CaveHeaven", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      expect(await caveHeaven.getDaoXinBonus(player1.address)).to.equal(0);
    });

    it("should return 100 for BlessedLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 3);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade();

      expect(await caveHeaven.getDaoXinBonus(player1.address)).to.equal(100);
    });

    it("should return 200 for SpiritLand", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 4);
      await caveHeaven.connect(player1).open();
      await caveHeaven.connect(player1).upgrade();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await addManyHours(caveHeaven, owner, player1.address, 4000 * 3600);
      await caveHeaven.connect(player1).upgrade();

      expect(await caveHeaven.getDaoXinBonus(player1.address)).to.equal(200);
    });
  });

  describe("addCultivationHours", function () {
    it("should add hours from authorized caller", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await caveHeaven.addCultivationHours(player1.address, 5 * 3600); // 5h

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.cultivationHours).to.equal(5 * 3600);
    });

    it("should reject from unauthorized caller", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await expect(
        caveHeaven.connect(player1).addCultivationHours(player1.address, 5 * 3600)
      ).to.be.revertedWith("CaveHeaven: unauthorized");
    });

    it("should ignore sessions under 4 hours", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await caveHeaven.addCultivationHours(player1.address, 3 * 3600); // 3h < 4h min

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.cultivationHours).to.equal(0); // Not added
    });

    it("should track full session duration without cap (auto-renewal)", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await caveHeaven.addCultivationHours(player1.address, 30 * 3600); // 30h

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.cultivationHours).to.equal(30 * 3600); // No longer capped
    });

    it("should do nothing for player with no cave", async function () {
      const { caveHeaven, owner, player1 } = await loadFixture(deployFixture);

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await caveHeaven.addCultivationHours(player1.address, 5 * 3600);

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.cultivationHours).to.equal(0);
    });

    it("should accumulate hours across sessions", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await caveHeaven.setAuthorizedCaller(owner.address, true);
      await caveHeaven.addCultivationHours(player1.address, 8 * 3600);
      await caveHeaven.addCultivationHours(player1.address, 6 * 3600);
      await caveHeaven.addCultivationHours(player1.address, 10 * 3600);

      const cave = await caveHeaven.getCaveInfo(player1.address);
      expect(cave.cultivationHours).to.equal(24 * 3600); // 8+6+10=24h
    });
  });

  describe("getOverdueDays", function () {
    it("should return 0 when no cave", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      expect(await caveHeaven.getOverdueDays(player1.address)).to.equal(0);
    });

    it("should return 0 when maintenance current", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      expect(await caveHeaven.getOverdueDays(player1.address)).to.equal(0);
    });

    it("should return correct overdue days", async function () {
      const { caveHeaven, register, owner, player1 } =
        await loadFixture(deployFixture);
      await setRealm(register, owner, player1.address, 2);
      await caveHeaven.connect(player1).open();

      await time.increase(5 * 86400);
      const overdue = await caveHeaven.getOverdueDays(player1.address);
      expect(overdue).to.be.gte(4);
      expect(overdue).to.be.lte(6);
    });
  });

  describe("admin", function () {
    it("should allow owner to authorize caller", async function () {
      const { caveHeaven, owner, player1 } = await loadFixture(deployFixture);
      await expect(caveHeaven.setAuthorizedCaller(player1.address, true))
        .to.emit(caveHeaven, "CallerAuthorized")
        .withArgs(player1.address, true);
    });

    it("should reject non-owner authorizing caller", async function () {
      const { caveHeaven, player1 } = await loadFixture(deployFixture);
      await expect(
        caveHeaven.connect(player1).setAuthorizedCaller(player1.address, true)
      ).to.be.revertedWith("CaveHeaven: not owner");
    });

    it("should reject zero address caller", async function () {
      const { caveHeaven } = await loadFixture(deployFixture);
      await expect(
        caveHeaven.setAuthorizedCaller(ethers.ZeroAddress, true)
      ).to.be.revertedWith("CaveHeaven: zero address");
    });
  });
});
