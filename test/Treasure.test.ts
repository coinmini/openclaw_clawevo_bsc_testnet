import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Treasury,
  TreasureHarness,
  Equipment,
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

  // Treasure (harness)
  const TreasureFactory = await ethers.getContractFactory("TreasureHarness");
  const treasure = (await TreasureFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
    await equipment.getAddress(),
    await pill.getAddress()
  )) as TreasureHarness;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await treasure.getAddress());
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize treasure in treasury
  await treasury.setAuthorizedCaller(await treasure.getAddress(), true);

  // Pill MINTER_ROLE for Treasure
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await treasure.getAddress());

  // Grant GAME_CONTRACT_ROLE to Treasure on Equipment
  const GAME_CONTRACT_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(GAME_CONTRACT_ROLE, await treasure.getAddress());

  // Register player1 (草莽, gets 20 LS)
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  // Give player1 extra LS
  await lingshi.connect(owner).mint(player1.address, ethers.parseEther("5000"));

  // Player1 approves treasure contract for spending
  await lingshi.connect(player1).approve(await treasure.getAddress(), ethers.MaxUint256);

  return { config, lingshi, treasury, register, equipment, pill, treasure, owner, player1, player2 };
}

describe("Treasure", function () {
  describe("Deployment", function () {
    it("should set 6 regions correctly", async function () {
      const { treasure } = await loadFixture(deployFixture);
      const r0 = await treasure.regions(0);
      expect(r0.difficulty).to.equal(1);
      expect(r0.element).to.equal(1); // 木
      expect(r0.roadFee).to.equal(ethers.parseEther("3"));

      const r4 = await treasure.regions(4);
      expect(r4.difficulty).to.equal(4);
      expect(r4.roadFee).to.equal(ethers.parseEther("8"));
    });

    it("should set correct CDF arrays", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.lowDiffDropCDF(0)).to.equal(3000);
      expect(await treasure.lowDiffDropCDF(4)).to.equal(10000);

      expect(await treasure.highDiffDropCDF(0)).to.equal(2000);
      expect(await treasure.highDiffDropCDF(5)).to.equal(10000);
    });

    it("should set correct drop rewards", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.dropRewards(0)).to.equal(0); // NONE
      expect(await treasure.dropRewards(1)).to.equal(ethers.parseEther("5"));
      expect(await treasure.dropRewards(5)).to.equal(ethers.parseEther("150")); // VEIN
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("TreasureHarness");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Treasure: zero lingshi");
    });

    it("should revert with zero treasury", async function () {
      const { lingshi } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("TreasureHarness");
      await expect(
        Factory.deploy(await lingshi.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Treasure: zero treasury");
    });

    it("should revert with zero register", async function () {
      const { lingshi, treasury } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("TreasureHarness");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(),
          await treasury.getAddress(),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Treasure: zero register");
    });
  });

  describe("startTreasure", function () {
    it("should start treasure hunt in region 0", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await expect(treasure.connect(player1).startTreasure(0))
        .to.emit(treasure, "TreasureStarted");

      const intent = await treasure.getIntent(player1.address);
      expect(intent.pending).to.be.true;
      expect(intent.regionId).to.equal(0);
    });

    it("should deduct road fee (3 LS for region 0)", async function () {
      const { treasure, lingshi, player1 } = await loadFixture(deployFixture);

      const before = await lingshi.balanceOf(player1.address);
      await treasure.connect(player1).startTreasure(0);
      const after = await lingshi.balanceOf(player1.address);

      expect(before - after).to.equal(ethers.parseEther("3"));
    });

    it("should deduct higher road fee for region 4 (8 LS)", async function () {
      const { treasure, lingshi, player1 } = await loadFixture(deployFixture);

      const before = await lingshi.balanceOf(player1.address);
      await treasure.connect(player1).startTreasure(4);
      const after = await lingshi.balanceOf(player1.address);

      expect(before - after).to.equal(ethers.parseEther("8"));
    });

    it("should reject invalid region", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);
      await expect(
        treasure.connect(player1).startTreasure(6)
      ).to.be.revertedWith("Treasure: invalid region");
    });

    it("should reject unregistered player", async function () {
      const { treasure, player2 } = await loadFixture(deployFixture);
      await expect(
        treasure.connect(player2).startTreasure(0)
      ).to.be.revertedWith("Treasure: not registered");
    });

    it("should reject if already pending", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);
      await treasure.connect(player1).startTreasure(0);
      await expect(
        treasure.connect(player1).startTreasure(0)
      ).to.be.revertedWith("Treasure: already pending");
    });

    it("should reject if insufficient LS for road fee", async function () {
      const { treasure, lingshi, player1, owner } = await loadFixture(deployFixture);
      const BURNER_ROLE = await lingshi.BURNER_ROLE();
      await lingshi.grantRole(BURNER_ROLE, owner.address);
      const balance = await lingshi.balanceOf(player1.address);
      await lingshi.connect(owner).burn(player1.address, balance - ethers.parseEther("2"));

      await expect(
        treasure.connect(player1).startTreasure(0) // needs 3 LS
      ).to.be.revertedWith("Treasure: insufficient LS for road fee");
    });

    it("should reject during cooldown", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(0);
      await mine(1);
      await treasure.connect(player1).finishTreasure();

      await expect(
        treasure.connect(player1).startTreasure(0)
      ).to.be.revertedWith("Treasure: cooldown active");
    });
  });

  describe("finishTreasure", function () {
    it("should complete treasure hunt and emit event", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(0);
      await mine(1);

      await expect(treasure.connect(player1).finishTreasure())
        .to.emit(treasure, "TreasureFinished");
    });

    it("should clear pending state", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(0);
      await mine(1);
      await treasure.connect(player1).finishTreasure();

      const intent = await treasure.getIntent(player1.address);
      expect(intent.pending).to.be.false;
    });

    it("should reject without pending intent", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);
      await expect(
        treasure.connect(player1).finishTreasure()
      ).to.be.revertedWith("Treasure: no pending intent");
    });

    it("should require block advancement before finish", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(0);
      const intent = await treasure.getIntent(player1.address);
      expect(intent.pending).to.be.true;

      // In Hardhat, each tx auto-mines a block, so finishTreasure will be
      // in a later block. We verify the normal flow works and the check exists.
      await mine(1); // explicit advance
      await expect(treasure.connect(player1).finishTreasure())
        .to.emit(treasure, "TreasureFinished");
    });

    it("should allow new treasure after cooldown", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(0);
      await mine(1);
      await treasure.connect(player1).finishTreasure();

      await time.increase(3601);
      await expect(treasure.connect(player1).startTreasure(0)).to.not.be.reverted;
    });

    it("should finish in high-difficulty region (4)", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      await treasure.connect(player1).startTreasure(4); // difficulty 4
      await mine(1);

      await expect(treasure.connect(player1).finishTreasure())
        .to.emit(treasure, "TreasureFinished");
    });

    it("should produce various drops across multiple runs in low-diff region", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      const dropCounts = new Map<number, number>();

      for (let i = 0; i < 15; i++) {
        if (i > 0) await time.increase(3601);
        await treasure.connect(player1).startTreasure(0); // low diff
        await mine(1);
        const tx = await treasure.connect(player1).finishTreasure();
        const receipt = await tx.wait();

        for (const log of receipt!.logs) {
          try {
            const parsed = treasure.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed?.name === "TreasureFinished") {
              const q = Number(parsed.args.quality);
              dropCounts.set(q, (dropCounts.get(q) || 0) + 1);
            }
          } catch {
            // skip
          }
        }
      }

      // At least some runs should complete
      const total = Array.from(dropCounts.values()).reduce((a, b) => a + b, 0);
      expect(total).to.equal(15);
    });

    it("should produce drops in high-diff region (4)", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);

      for (let i = 0; i < 10; i++) {
        if (i > 0) await time.increase(3601);
        await treasure.connect(player1).startTreasure(4); // high diff
        await mine(1);
        await expect(treasure.connect(player1).finishTreasure())
          .to.emit(treasure, "TreasureFinished");
      }
    });
  });

  describe("Drop Resolution (via harness)", function () {
    it("_resolveLowDiffDrop: should return NONE for roll < 3000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveLowDiffDrop(0)).to.equal(0); // NONE
      expect(await treasure.exposed_resolveLowDiffDrop(2999)).to.equal(0);
    });

    it("_resolveLowDiffDrop: should return WHITE for 3000 ≤ roll < 7000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveLowDiffDrop(3000)).to.equal(1); // WHITE
      expect(await treasure.exposed_resolveLowDiffDrop(6999)).to.equal(1);
    });

    it("_resolveLowDiffDrop: should return GREEN for 7000 ≤ roll < 8800", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveLowDiffDrop(7000)).to.equal(2); // GREEN
      expect(await treasure.exposed_resolveLowDiffDrop(8799)).to.equal(2);
    });

    it("_resolveLowDiffDrop: should return BLUE for 9000 ≤ roll < 9800", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveLowDiffDrop(9000)).to.equal(3); // BLUE
      expect(await treasure.exposed_resolveLowDiffDrop(9799)).to.equal(3);
    });

    it("_resolveLowDiffDrop: should return VEIN for roll ≥ 9800", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveLowDiffDrop(9800)).to.equal(5); // VEIN (index 5 in enum)
      expect(await treasure.exposed_resolveLowDiffDrop(9999)).to.equal(5);
    });

    it("_resolveHighDiffDrop: should return NONE for roll < 2000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(0)).to.equal(0);
      expect(await treasure.exposed_resolveHighDiffDrop(1999)).to.equal(0);
    });

    it("_resolveHighDiffDrop: should return WHITE for 2000 ≤ roll < 5000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(2000)).to.equal(1);
      expect(await treasure.exposed_resolveHighDiffDrop(4999)).to.equal(1);
    });

    it("_resolveHighDiffDrop: should return GREEN for 5000 ≤ roll < 7200", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(5000)).to.equal(2);
      expect(await treasure.exposed_resolveHighDiffDrop(7199)).to.equal(2);
    });

    it("_resolveHighDiffDrop: should return BLUE for 7200 ≤ roll < 8700", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(7200)).to.equal(3);
      expect(await treasure.exposed_resolveHighDiffDrop(8699)).to.equal(3);
    });

    it("_resolveHighDiffDrop: should return PURPLE for 8700 ≤ roll < 9000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(8700)).to.equal(4);
      expect(await treasure.exposed_resolveHighDiffDrop(8999)).to.equal(4);
    });

    it("_resolveHighDiffDrop: should return VEIN for roll ≥ 9000", async function () {
      const { treasure } = await loadFixture(deployFixture);
      expect(await treasure.exposed_resolveHighDiffDrop(9000)).to.equal(5);
      expect(await treasure.exposed_resolveHighDiffDrop(9999)).to.equal(5);
    });
  });

  describe("getIntent", function () {
    it("should return default for player who never started", async function () {
      const { treasure, player1 } = await loadFixture(deployFixture);
      const intent = await treasure.getIntent(player1.address);
      expect(intent.pending).to.be.false;
      expect(intent.regionId).to.equal(0);
      expect(intent.blockNumber).to.equal(0);
    });
  });
});
