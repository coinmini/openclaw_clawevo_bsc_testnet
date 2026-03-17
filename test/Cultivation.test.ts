import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Cultivation,
  Treasury,
  Pill,
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

  // Pill
  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // Cultivation
  const CultivationFactory = await ethers.getContractFactory("Cultivation");
  const cultivation = (await CultivationFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress(),
    await treasury.getAddress(),
    await pill.getAddress(),
    await register.getAddress()
  )) as Cultivation;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await cultivation.getAddress());
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Pill MINTER_ROLE for Cultivation (to burn pills)
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await cultivation.getAddress());
  await pill.grantRole(PILL_MINTER, owner.address); // for test minting pills

  // Authorize Cultivation as updater in Register (for experience/subRealm/attributes)
  await register.setAuthorizedUpdater(await cultivation.getAddress(), true);

  // Authorize Treasury caller for Cultivation (for breakthrough fee collection)
  await treasury.setAuthorizedCaller(await cultivation.getAddress(), true);

  // Register player1 (草莽)
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  return {
    config,
    lingshi,
    treasury,
    register,
    pill,
    cultivation,
    owner,
    devWallet,
    foundationWallet,
    player1,
    player2,
  };
}

describe("Cultivation", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { cultivation, lingshi, config, treasury, register } =
        await loadFixture(deployFixture);
      expect(await cultivation.lingshi()).to.equal(await lingshi.getAddress());
      expect(await cultivation.gameConfig()).to.equal(await config.getAddress());
      expect(await cultivation.treasury()).to.equal(await treasury.getAddress());
      expect(await cultivation.register()).to.equal(await register.getAddress());
    });

    it("should set correct output parameters", async function () {
      const { cultivation } = await loadFixture(deployFixture);
      expect(await cultivation.outputPerHour(0)).to.equal(ethers.parseEther("2"));
      expect(await cultivation.outputPerHour(1)).to.equal(ethers.parseEther("5"));
      expect(await cultivation.outputPerHour(4)).to.equal(ethers.parseEther("40"));
    });

    it("should set correct fee parameters", async function () {
      const { cultivation } = await loadFixture(deployFixture);
      expect(await cultivation.feePerHour(0)).to.equal(ethers.parseEther("1.5"));
      expect(await cultivation.feePerHour(4)).to.equal(ethers.parseEther("10"));
    });

    it("should set correct breakthrough rates", async function () {
      const { cultivation } = await loadFixture(deployFixture);
      expect(await cultivation.breakthroughBaseRate(0)).to.equal(9000);
      expect(await cultivation.breakthroughBaseRate(3)).to.equal(5000);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Cultivation");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Cultivation: zero lingshi");
    });
  });

  describe("startCultivation", function () {
    it("should start cultivation for registered player", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);
      await expect(cultivation.connect(player1).startCultivation())
        .to.emit(cultivation, "CultivationStarted");

      const session = await cultivation.getSession(player1.address);
      expect(session.active).to.be.true;
    });

    it("should reject unregistered player", async function () {
      const { cultivation, player2 } = await loadFixture(deployFixture);
      await expect(
        cultivation.connect(player2).startCultivation()
      ).to.be.revertedWith("Cultivation: not registered");
    });

    it("should reject double cultivation", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);
      await cultivation.connect(player1).startCultivation();
      await expect(
        cultivation.connect(player1).startCultivation()
      ).to.be.revertedWith("Cultivation: already cultivating");
    });
  });

  describe("endCultivation", function () {
    it("should settle rewards after 1 hour (练气 net = 0.5 LS/h)", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      const balanceBefore = await lingshi.balanceOf(player1.address);
      await cultivation.connect(player1).startCultivation();

      // Advance 1 hour
      await time.increase(3600);

      await expect(cultivation.connect(player1).endCultivation())
        .to.emit(cultivation, "CultivationEnded");

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // 练气: output=2LS/h, fee=1.5LS/h → net=0.5LS/h
      // After ~1 hour: ~0.5 LS (small tolerance for block timing)
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("0.5");
      const tolerance = ethers.parseEther("0.001"); // ~3.6s worth
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should settle rewards after 4 hours", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      const balanceBefore = await lingshi.balanceOf(player1.address);
      await cultivation.connect(player1).startCultivation();

      await time.increase(4 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // 4 hours × 0.5 LS/h = 2 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("2");
      const tolerance = ethers.parseEther("0.001");
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should accumulate rewards beyond 24 hours (auto-renewal)", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      // Align to start of a fresh UTC day
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      const balanceBefore = await lingshi.balanceOf(player1.address);
      await cultivation.connect(player1).startCultivation();

      // Advance 30 hours — crosses into day 2
      await time.increase(30 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // Day 1: ~24h in day, capped at 16h effective
      // Day 2: ~6h in day, all effective (< 16h cap)
      // Total effective: 16 + 6 = 22h → 22 × 0.5 = 11 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("11");
      const tolerance = ethers.parseEther("0.002");
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should respect daily 16h output cap", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      // Advance to the start of a fresh UTC day to avoid crossing midnight
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      const balanceBefore = await lingshi.balanceOf(player1.address);

      // Session 1: 10 hours
      await cultivation.connect(player1).startCultivation();
      await time.increase(10 * 3600);
      await cultivation.connect(player1).endCultivation();

      // Session 2: 10 hours (but only 6h remaining in daily cap)
      await cultivation.connect(player1).startCultivation();
      await time.increase(10 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // Total effective: 10h + 6h = 16h → 16 × 0.5 = 8 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("8");
      const tolerance = ethers.parseEther("0.002"); // small tolerance for block timing
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should reject end without active session", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);
      await expect(
        cultivation.connect(player1).endCultivation()
      ).to.be.revertedWith("Cultivation: not cultivating");
    });

    it("should emit correct event values", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await cultivation.connect(player1).startCultivation();
      await time.increase(3600); // 1 hour

      const tx = await cultivation.connect(player1).endCultivation();
      const receipt = await tx.wait();

      // Find event
      const event = receipt?.logs.find((log) => {
        try {
          return cultivation.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          })?.name === "CultivationEnded";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;
    });

    it("should allow re-cultivation after ending", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await cultivation.connect(player1).startCultivation();
      await time.increase(3600);
      await cultivation.connect(player1).endCultivation();

      // Should be able to start again
      await expect(cultivation.connect(player1).startCultivation()).to.not.be
        .reverted;
    });
  });

  describe("Multi-day auto-renewal", function () {
    it("should correctly accumulate rewards over 3 days", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      // Align to start of a fresh UTC day
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      const balanceBefore = await lingshi.balanceOf(player1.address);
      await cultivation.connect(player1).startCultivation();

      // Advance exactly 3 full days (72 hours)
      await time.increase(72 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // Day 1: ~24h, capped at 16h; Day 2: 24h, capped at 16h; Day 3: ~24h, capped at 16h
      // Total effective: 3 × 16 = 48h → 48 × 0.5 = 24 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("24");
      const tolerance = ethers.parseEther("0.002");
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should respect prior session hoursUsed for start day", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      // Align to start of a fresh UTC day
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      // Session 1: cultivate 10 hours on day 1
      await cultivation.connect(player1).startCultivation();
      await time.increase(10 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceBefore = await lingshi.balanceOf(player1.address);

      // Session 2: cultivate 28 hours (rest of day 1 + 14h into day 2)
      await cultivation.connect(player1).startCultivation();
      await time.increase(28 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // Day 1: 10h already used, ~14h remain, cap at 6h more → 6h effective
      // Day 2: ~14h, all under 16h cap → 14h effective
      // Total effective: 6 + 14 = 20h → 20 × 0.5 = 10 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("10");
      const tolerance = ethers.parseEther("0.002");
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should handle 30+ day session without reverting", async function () {
      const { cultivation, lingshi, player1 } = await loadFixture(deployFixture);

      // Align to start of a fresh UTC day
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      const balanceBefore = await lingshi.balanceOf(player1.address);
      await cultivation.connect(player1).startCultivation();

      // Advance 30 days
      await time.increase(30 * 24 * 3600);
      await cultivation.connect(player1).endCultivation();

      const balanceAfter = await lingshi.balanceOf(player1.address);
      // 30 days × 16h/day = 480h effective → 480 × 0.5 = 240 LS
      const earned = balanceAfter - balanceBefore;
      const expected = ethers.parseEther("240");
      const tolerance = ethers.parseEther("0.002");
      expect(earned).to.be.gte(expected);
      expect(earned).to.be.lte(expected + tolerance);
    });

    it("should accumulate exp/heart/fortune on full duration (no daily cap)", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      // Align to start of a fresh UTC day
      const currentTime = await time.latest();
      const nextDayStart = (Math.floor(currentTime / 86400) + 1) * 86400;
      await time.increaseTo(nextDayStart + 1);

      await cultivation.connect(player1).startCultivation();

      // Advance exactly 48 hours
      await time.increase(48 * 3600);

      const [lsNet, exp, heart, fortune] = await cultivation.estimateRewards(player1.address);

      // LS: 2 days × 16h × 0.5 = 16 LS
      const expectedLs = ethers.parseEther("16");
      const tolerance = ethers.parseEther("0.002");
      expect(lsNet).to.be.gte(expectedLs);
      expect(lsNet).to.be.lte(expectedLs + tolerance);

      // Exp: 48h × 20/h = 960 (full duration, no cap)
      expect(exp).to.equal(960);
      // Heart: 48h × 8/h = 384
      expect(heart).to.equal(384);
      // Fortune: 48h × 4/h = 192
      expect(fortune).to.equal(192);
    });
  });

  describe("estimateRewards", function () {
    it("should return correct estimates during session", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await cultivation.connect(player1).startCultivation();
      await time.increase(2 * 3600); // 2 hours

      const [lsNet, exp, heart, fortune] = await cultivation.estimateRewards(
        player1.address
      );

      // 2h: net = 2×0.5 = 1 LS, exp = 2×20 = 40, heart = 2×8 = 16, fortune = 2×4 = 8
      expect(lsNet).to.equal(ethers.parseEther("1"));
      expect(exp).to.equal(40);
      expect(heart).to.equal(16);
      expect(fortune).to.equal(8);
    });

    it("should return zeros when not cultivating", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);
      const [lsNet, exp, heart, fortune] = await cultivation.estimateRewards(
        player1.address
      );
      expect(lsNet).to.equal(0);
      expect(exp).to.equal(0);
      expect(heart).to.equal(0);
      expect(fortune).to.equal(0);
    });
  });

  describe("Experience storage", function () {
    it("should accumulate experience on chain after endCultivation", async function () {
      const { cultivation, register, player1 } = await loadFixture(deployFixture);

      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600); // 5 hours → 5×20 = 100 exp
      await cultivation.connect(player1).endCultivation();

      const exp = await register.experience(player1.address);
      expect(exp).to.equal(100);
    });

    it("should accumulate across multiple sessions", async function () {
      const { cultivation, register, player1 } = await loadFixture(deployFixture);

      // Session 1: 5 hours → 100 exp
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();

      // Session 2: 3 hours → 60 exp
      await cultivation.connect(player1).startCultivation();
      await time.increase(3 * 3600);
      await cultivation.connect(player1).endCultivation();

      const exp = await register.experience(player1.address);
      expect(exp).to.equal(160);
    });
  });

  describe("levelUp", function () {
    it("should level up from 1重 to 2重 with 100 exp", async function () {
      const { cultivation, register, player1 } = await loadFixture(deployFixture);

      // Accumulate 100 exp (5h × 20/h)
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();

      const before = await register.getCultivator(player1.address);
      expect(before.subRealm).to.equal(0);

      // 均匀分配 20 点: (5, 5, 5, 5)
      await expect(cultivation.connect(player1).levelUp(5, 5, 5, 5))
        .to.emit(cultivation, "SubRealmAdvanced")
        .withArgs(player1.address, 0, 0, 1, 100);

      const after = await register.getCultivator(player1.address);
      expect(after.subRealm).to.equal(1);
      // 草莽 attack = 115, after levelUp: 115 + 5 = 120
      expect(after.attack).to.equal(120);
      // defense was 105 (草莽 +5%), now 105 + 5 = 110
      expect(after.defense).to.equal(110);
      // perception was 100, now 105
      expect(after.perception).to.equal(105);
      // wisdom was 100, now 105
      expect(after.wisdom).to.equal(105);

      // Experience consumed: 100 spent, 0 remaining
      expect(await register.experience(player1.address)).to.equal(0);
    });

    it("should require sufficient experience", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      // Only 50 exp (not enough for 100)
      await cultivation.connect(player1).startCultivation();
      await time.increase(2.5 * 3600); // 2.5h → 50 exp
      await cultivation.connect(player1).endCultivation();

      await expect(
        cultivation.connect(player1).levelUp(5, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: insufficient experience");
    });

    it("should reject levelUp during cultivation", async function () {
      const { cultivation, register, player1 } = await loadFixture(deployFixture);

      // Give enough experience first
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();

      // Start new session then try levelUp
      await cultivation.connect(player1).startCultivation();
      await expect(
        cultivation.connect(player1).levelUp(5, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: in cultivation");
    });

    it("should reject levelUp at max sub-realm (9重)", async function () {
      const { cultivation, register, player1, owner } = await loadFixture(deployFixture);

      // Manually set subRealm to 8 (9重)
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateSubRealm(player1.address, 8);

      await expect(
        cultivation.connect(player1).levelUp(5, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: max sub-realm");
    });

    it("should reject invalid point allocation (sum != totalPoints)", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      // Accumulate 100 exp
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();

      // Total should be 20 (5×4), but we pass 21
      await expect(
        cultivation.connect(player1).levelUp(6, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: invalid point allocation");

      // Too few points (19)
      await expect(
        cultivation.connect(player1).levelUp(4, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: invalid point allocation");
    });

    it("should allow skewed allocation (all points to one attribute)", async function () {
      const { cultivation, register, player1 } = await loadFixture(deployFixture);

      // Accumulate 100 exp
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();

      const before = await register.getCultivator(player1.address);

      // Put all 20 points into attack
      await cultivation.connect(player1).levelUp(20, 0, 0, 0);

      const after = await register.getCultivator(player1.address);
      // 草莽 attack=115, +20 = 135
      expect(after.attack).to.equal(before.attack + BigInt(20));
      // Others unchanged
      expect(after.defense).to.equal(before.defense);
      expect(after.perception).to.equal(before.perception);
      expect(after.wisdom).to.equal(before.wisdom);
    });

    it("should increase exp requirement each level", async function () {
      const { cultivation } = await loadFixture(deployFixture);

      // 练气: base=100, step=14
      // 1重→2重: 100 + 0×14 = 100
      expect(await cultivation.getSubRealmExpRequired(0, 0)).to.equal(100);
      // 2重→3重: 100 + 1×14 = 114
      expect(await cultivation.getSubRealmExpRequired(0, 1)).to.equal(114);
      // 8重→9重: 100 + 7×14 = 198
      expect(await cultivation.getSubRealmExpRequired(0, 7)).to.equal(198);
    });
  });

  describe("breakthrough", function () {
    it("should reject if not at 9重", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await expect(
        cultivation.connect(player1).breakthrough(false)
      ).to.be.revertedWith("Cultivation: not 9th sub-realm");
    });

    it("should reject if no breakthrough pill", async function () {
      const { cultivation, register, player1, owner } = await loadFixture(deployFixture);

      // Set to 练气9重
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateSubRealm(player1.address, 8);

      // Player has no 筑基丹 (pillType=0)
      await expect(
        cultivation.connect(player1).breakthrough(false)
      ).to.be.revertedWith("Cultivation: no breakthrough pill");
    });

    it("should attempt breakthrough with breakthrough pill", async function () {
      const { cultivation, register, pill, player1, owner } = await loadFixture(deployFixture);

      // Set to 练气9重
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateSubRealm(player1.address, 8);

      // Mint 筑基丹 (pillType=0) for player1
      await pill.mint(player1.address, 0, 1);

      // Attempt breakthrough (may succeed or fail based on random)
      await expect(cultivation.connect(player1).breakthrough(false))
        .to.emit(cultivation, "BreakthroughAttempted");

      // 筑基丹 should be consumed
      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(0);
    });

    it("should use protection pill on failure attempt", async function () {
      const { cultivation, register, pill, player1, owner } = await loadFixture(deployFixture);

      // Set to 练气9重
      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateSubRealm(player1.address, 8);

      // Mint 筑基丹 + 护心丹 for player
      await pill.mint(player1.address, 0, 1);
      await pill.mint(player1.address, 7, 1);

      // Attempt breakthrough with protection (may or may not consume protection pill)
      await expect(cultivation.connect(player1).breakthrough(true))
        .to.emit(cultivation, "BreakthroughAttempted");

      // 筑基丹 always consumed
      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(0);
    });

    it("should reject breakthrough at max realm (化神)", async function () {
      const { cultivation, register, player1, owner } = await loadFixture(deployFixture);

      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateRealm(player1.address, 4); // 化神
      await register.updateSubRealm(player1.address, 8);

      await expect(
        cultivation.connect(player1).breakthrough(false)
      ).to.be.revertedWith("Cultivation: max realm");
    });

    it("should reject breakthrough during cultivation", async function () {
      const { cultivation, register, player1, owner } = await loadFixture(deployFixture);

      await register.setAuthorizedUpdater(owner.address, true);
      await register.updateSubRealm(player1.address, 8);

      await cultivation.connect(player1).startCultivation();

      await expect(
        cultivation.connect(player1).breakthrough(false)
      ).to.be.revertedWith("Cultivation: in cultivation");
    });
  });

  describe("consumeExpPill", function () {
    it("should consume 培元丹 and gain 50 exp", async function () {
      const { cultivation, register, pill, player1 } = await loadFixture(deployFixture);

      // Mint 培元丹 (pillType=4) for player1
      await pill.mint(player1.address, 4, 1);

      await expect(cultivation.connect(player1).consumeExpPill(4))
        .to.emit(cultivation, "ExpPillConsumed")
        .withArgs(player1.address, 4, 50);

      expect(await register.experience(player1.address)).to.equal(50);
      expect(await pill.balanceOfPill(player1.address, 4)).to.equal(0);
    });

    it("should consume 聚灵丹 and gain 200 exp", async function () {
      const { cultivation, register, pill, player1 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 5, 1);

      await expect(cultivation.connect(player1).consumeExpPill(5))
        .to.emit(cultivation, "ExpPillConsumed")
        .withArgs(player1.address, 5, 200);

      expect(await register.experience(player1.address)).to.equal(200);
    });

    it("should reject invalid pill type", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await expect(
        cultivation.connect(player1).consumeExpPill(0)
      ).to.be.revertedWith("Cultivation: invalid exp pill");
    });

    it("should reject if no pill balance", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      // Player has no 培元丹
      await expect(
        cultivation.connect(player1).consumeExpPill(4)
      ).to.be.reverted; // burn will revert
    });

    it("should reject unregistered player", async function () {
      const { cultivation, player2 } = await loadFixture(deployFixture);

      await expect(
        cultivation.connect(player2).consumeExpPill(4)
      ).to.be.revertedWith("Cultivation: not registered");
    });
  });

  describe("useXisuiDan", function () {
    it("should reset attributes with 洗髓丹 at 2重", async function () {
      const { cultivation, register, pill, player1, owner } = await loadFixture(deployFixture);

      // Level up to 练气2重 first (need 100 exp)
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();
      await cultivation.connect(player1).levelUp(20, 0, 0, 0); // all attack

      const after = await register.getCultivator(player1.address);
      expect(after.subRealm).to.equal(1);
      expect(after.attack).to.equal(135); // 115 + 20

      // Mint 洗髓丹 (pillType=6)
      await pill.mint(player1.address, 6, 1);

      // Reset: subRealm=1, totalPoints = 1 × (5 × 4) = 20, redistribute evenly
      await expect(cultivation.connect(player1).useXisuiDan(5, 5, 5, 5))
        .to.emit(cultivation, "AttributesReset")
        .withArgs(player1.address, 5, 5, 5, 5);

      const reset = await register.getCultivator(player1.address);
      // base=100 (练气), +5 each = 105
      expect(reset.attack).to.equal(105);
      expect(reset.defense).to.equal(105);
      expect(reset.perception).to.equal(105);
      expect(reset.wisdom).to.equal(105);
    });

    it("should reject if no 洗髓丹", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);

      await expect(
        cultivation.connect(player1).useXisuiDan(0, 0, 0, 0)
      ).to.be.revertedWith("Cultivation: no xisui pill");
    });

    it("should reject during cultivation", async function () {
      const { cultivation, pill, player1 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 6, 1);
      await cultivation.connect(player1).startCultivation();

      await expect(
        cultivation.connect(player1).useXisuiDan(0, 0, 0, 0)
      ).to.be.revertedWith("Cultivation: in cultivation");
    });

    it("should reject invalid point allocation", async function () {
      const { cultivation, register, pill, player1, owner } = await loadFixture(deployFixture);

      // Level up to 2重
      await cultivation.connect(player1).startCultivation();
      await time.increase(5 * 3600);
      await cultivation.connect(player1).endCultivation();
      await cultivation.connect(player1).levelUp(5, 5, 5, 5);

      await pill.mint(player1.address, 6, 1);

      // totalPoints = 1 × 20 = 20, but we pass 21
      await expect(
        cultivation.connect(player1).useXisuiDan(6, 5, 5, 5)
      ).to.be.revertedWith("Cultivation: invalid point allocation");
    });

    it("should allow at 1重 (0 points to redistribute)", async function () {
      const { cultivation, register, pill, player1 } = await loadFixture(deployFixture);

      // At 1重 (subRealm=0), totalPoints = 0 × 20 = 0
      await pill.mint(player1.address, 6, 1);

      await expect(cultivation.connect(player1).useXisuiDan(0, 0, 0, 0))
        .to.emit(cultivation, "AttributesReset");

      // Attributes reset to realm base (100 for 练气)
      const c = await register.getCultivator(player1.address);
      expect(c.attack).to.equal(100);
      expect(c.defense).to.equal(100);
      expect(c.perception).to.equal(100);
      expect(c.wisdom).to.equal(100);
    });
  });

  describe("Admin setters (升重参数)", function () {
    it("should set subRealmExpBase", async function () {
      const { cultivation, owner } = await loadFixture(deployFixture);
      await cultivation.setSubRealmExpBase(0, 200);
      expect(await cultivation.subRealmExpBase(0)).to.equal(200);
    });

    it("should set subRealmExpStep", async function () {
      const { cultivation, owner } = await loadFixture(deployFixture);
      await cultivation.setSubRealmExpStep(0, 20);
      expect(await cultivation.subRealmExpStep(0)).to.equal(20);
    });

    it("should set attributeStep", async function () {
      const { cultivation, owner } = await loadFixture(deployFixture);
      await cultivation.setAttributeStep(0, 8);
      expect(await cultivation.attributeStep(0)).to.equal(8);
    });

    it("should set realmBaseAttribute", async function () {
      const { cultivation, owner } = await loadFixture(deployFixture);
      await cultivation.setRealmBaseAttribute(1, 180);
      expect(await cultivation.realmBaseAttribute(1)).to.equal(180);
    });

    it("should reject non-owner", async function () {
      const { cultivation, player1 } = await loadFixture(deployFixture);
      await expect(
        cultivation.connect(player1).setSubRealmExpBase(0, 200)
      ).to.be.revertedWith("Cultivation: not owner");
    });

    it("should reject invalid realm index", async function () {
      const { cultivation } = await loadFixture(deployFixture);
      await expect(
        cultivation.setSubRealmExpBase(5, 200)
      ).to.be.revertedWith("Cultivation: invalid realm");
    });

    it("should have correct initial升重 parameters", async function () {
      const { cultivation } = await loadFixture(deployFixture);

      // subRealmExpBase
      expect(await cultivation.subRealmExpBase(0)).to.equal(100);
      expect(await cultivation.subRealmExpBase(1)).to.equal(400);
      expect(await cultivation.subRealmExpBase(4)).to.equal(5000);

      // attributeStep
      expect(await cultivation.attributeStep(0)).to.equal(5);
      expect(await cultivation.attributeStep(1)).to.equal(10);
      expect(await cultivation.attributeStep(4)).to.equal(50);

      // realmBaseAttribute
      expect(await cultivation.realmBaseAttribute(0)).to.equal(100);
      expect(await cultivation.realmBaseAttribute(1)).to.equal(160);
      expect(await cultivation.realmBaseAttribute(4)).to.equal(950);
    });
  });
});
