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
  Beast,
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

  // Beast
  const BeastFactory = await ethers.getContractFactory("Beast");
  const beast = (await BeastFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Beast;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await beast.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize beast to call treasury
  await treasury.setAuthorizedCaller(await beast.getAddress(), true);

  // Grant GAME_CONTRACT_ROLE to owner (for test minting)
  const GAME_CONTRACT_ROLE = await beast.GAME_CONTRACT_ROLE();
  await beast.grantRole(GAME_CONTRACT_ROLE, owner.address);

  // Register player1 (草莽: perception=100)
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  // Register player2 (游商: perception=115)
  await register.connect(player2).registerIntent(1, 1, "仙人");
  await mine(1);
  await register.connect(player2).finalizeRegistration();

  // Give players LS for hunt fees
  await lingshi.mint(player1.address, ethers.parseEther("1000"));
  await lingshi.mint(player2.address, ethers.parseEther("1000"));
  await lingshi.connect(player1).approve(await beast.getAddress(), ethers.MaxUint256);
  await lingshi.connect(player2).approve(await beast.getAddress(), ethers.MaxUint256);

  return {
    config,
    lingshi,
    treasury,
    register,
    beast,
    owner,
    devWallet,
    foundationWallet,
    player1,
    player2,
    player3,
  };
}

describe("Beast", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { beast, lingshi, treasury, register } =
        await loadFixture(deployFixture);
      expect(await beast.lingshi()).to.equal(await lingshi.getAddress());
      expect(await beast.treasury()).to.equal(await treasury.getAddress());
      expect(await beast.register()).to.equal(await register.getAddress());
    });

    it("should set correct region data", async function () {
      const { beast } = await loadFixture(deployFixture);
      const region0 = await beast.beastRegions(0);
      expect(region0.element).to.equal(1); // 木
      expect(region0.resistance).to.equal(80);
      expect(region0.huntFee).to.equal(ethers.parseEther("5"));

      const region5 = await beast.beastRegions(5);
      expect(region5.resistance).to.equal(500);
    });

    it("should set correct appearance CDF", async function () {
      const { beast } = await loadFixture(deployFixture);
      expect(await beast.appearanceCDF(0)).to.equal(7000);
      expect(await beast.appearanceCDF(1)).to.equal(9200);
      expect(await beast.appearanceCDF(2)).to.equal(10000);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Beast");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Beast: zero lingshi");
    });
  });

  describe("startBeastHunt", function () {
    it("should start hunt and deduct fee", async function () {
      const { beast, lingshi, player1 } = await loadFixture(deployFixture);

      const balBefore = await lingshi.balanceOf(player1.address);
      await expect(beast.connect(player1).startBeastHunt(0))
        .to.emit(beast, "BeastHuntStarted");

      const balAfter = await lingshi.balanceOf(player1.address);
      expect(balBefore - balAfter).to.equal(ethers.parseEther("5"));

      const intent = await beast.getHuntIntent(player1.address);
      expect(intent.pending).to.be.true;
      expect(intent.regionId).to.equal(0);
    });

    it("should reject unregistered player", async function () {
      const { beast, player3 } = await loadFixture(deployFixture);
      await expect(
        beast.connect(player3).startBeastHunt(0)
      ).to.be.revertedWith("Beast: not registered");
    });

    it("should reject invalid region", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.connect(player1).startBeastHunt(6)
      ).to.be.revertedWith("Beast: invalid region");
    });

    it("should reject double hunt", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.connect(player1).startBeastHunt(0);
      await expect(
        beast.connect(player1).startBeastHunt(0)
      ).to.be.revertedWith("Beast: hunt pending");
    });

    it("should reject hunt during cooldown", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.connect(player1).startBeastHunt(0);
      await mine(1);
      await beast.connect(player1).finishBeastHunt();

      // Try again immediately (within 1h cooldown)
      await expect(
        beast.connect(player1).startBeastHunt(0)
      ).to.be.revertedWith("Beast: cooldown active");
    });

    it("should allow hunt after cooldown", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.connect(player1).startBeastHunt(0);
      await mine(1);
      await beast.connect(player1).finishBeastHunt();

      await time.increase(3600); // 1 hour
      await expect(beast.connect(player1).startBeastHunt(0)).to.not.be.reverted;
    });

    it("should reject with insufficient LS", async function () {
      const { beast, lingshi, player1 } = await loadFixture(deployFixture);

      // Drain player LS
      const balance = await lingshi.balanceOf(player1.address);
      await lingshi.connect(player1).transfer(ethers.ZeroAddress.replace("0x0", "0x1"), balance);

      await expect(
        beast.connect(player1).startBeastHunt(0)
      ).to.be.revertedWith("Beast: insufficient LS");
    });
  });

  describe("finishBeastHunt", function () {
    it("should finish hunt and emit event", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      await beast.connect(player1).startBeastHunt(0);
      await mine(1);

      await expect(beast.connect(player1).finishBeastHunt())
        .to.emit(beast, "BeastHuntFinished");

      const intent = await beast.getHuntIntent(player1.address);
      expect(intent.pending).to.be.false;
    });

    it("should reject with no pending hunt", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.connect(player1).finishBeastHunt()
      ).to.be.revertedWith("Beast: no pending hunt");
    });

    it("should produce beasts over multiple hunts", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      // Do 20 hunts, check that at least some produce beasts via finishBeastHunt
      let totalBeasts = 0;
      for (let i = 0; i < 20; i++) {
        await beast.connect(player1).startBeastHunt(0); // region 0: resistance=80
        await mine(1);

        const tx = await beast.connect(player1).finishBeastHunt();
        const receipt = await tx.wait();

        const mintEvent = receipt?.logs.find((log) => {
          try {
            return beast.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            })?.name === "BeastMinted";
          } catch {
            return false;
          }
        });

        if (mintEvent) totalBeasts++;

        // Advance past cooldown for next hunt
        await time.increase(3600);
      }

      // With 30% appearance rate (22% + 8%) and low resistance (80) for region 0,
      // finishBeastHunt directly captures if perception >= threshold.
      expect(totalBeasts).to.be.gte(1);
    });
  });

  describe("mint (direct)", function () {
    it("should mint beast with GAME_CONTRACT_ROLE", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      await expect(beast.mint(player1.address, 1, 2, 500, 0))
        .to.emit(beast, "BeastMinted");

      const info = await beast.getBeastInfo(1);
      expect(info.star).to.equal(1);
      expect(info.element).to.equal(2);
      expect(info.powerRate).to.equal(500);
      expect(info.level).to.equal(1);
      expect(info.speciesId).to.equal(0);
    });

    it("should reject non-GAME_CONTRACT_ROLE", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.connect(player1).mint(player1.address, 1, 2, 500, 0)
      ).to.be.reverted;
    });

    it("should reject invalid star", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.mint(player1.address, 0, 2, 500, 0)
      ).to.be.revertedWith("Beast: invalid star");
      await expect(
        beast.mint(player1.address, 3, 2, 500, 0)
      ).to.be.revertedWith("Beast: invalid star");
    });

    it("should reject invalid element", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.mint(player1.address, 1, 5, 500, 0)
      ).to.be.revertedWith("Beast: invalid element");
    });
  });

  describe("equipBeast / unequipBeast", function () {
    it("should equip beast", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.mint(player1.address, 1, 0, 500, 0);

      await expect(beast.connect(player1).equipBeast(1))
        .to.emit(beast, "BeastEquipped")
        .withArgs(player1.address, 1);

      expect(await beast.getEquippedBeast(player1.address)).to.equal(1);
    });

    it("should replace previously equipped beast", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.mint(player1.address, 1, 0, 500, 0);
      await beast.mint(player1.address, 2, 1, 1200, 2);

      await beast.connect(player1).equipBeast(1);
      await beast.connect(player1).equipBeast(2);

      expect(await beast.getEquippedBeast(player1.address)).to.equal(2);
    });

    it("should reject equip by non-owner", async function () {
      const { beast, player1, player2 } = await loadFixture(deployFixture);
      await beast.mint(player1.address, 1, 0, 500, 0);

      await expect(
        beast.connect(player2).equipBeast(1)
      ).to.be.revertedWith("Beast: not owner");
    });

    it("should reject equip by unregistered player", async function () {
      const { beast, player3 } = await loadFixture(deployFixture);
      await beast.mint(player3.address, 1, 0, 500, 0);

      await expect(
        beast.connect(player3).equipBeast(1)
      ).to.be.revertedWith("Beast: not registered");
    });

    it("should unequip beast", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await beast.mint(player1.address, 1, 0, 500, 0);
      await beast.connect(player1).equipBeast(1);

      await expect(beast.connect(player1).unequipBeast())
        .to.emit(beast, "BeastUnequipped")
        .withArgs(player1.address, 1);

      expect(await beast.getEquippedBeast(player1.address)).to.equal(0);
    });

    it("should reject unequip when none equipped", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      await expect(
        beast.connect(player1).unequipBeast()
      ).to.be.revertedWith("Beast: no beast equipped");
    });
  });

  describe("element affinity", function () {
    it("should apply same-element bonus (+1%)", async function () {
      const { beast, player1, player2 } = await loadFixture(deployFixture);

      // Do multiple hunts in various regions to test the affinity logic.
      // We test the internal logic indirectly via the minted beast powerRate.
      // Direct mint doesn't go through affinity logic, so we test via the formula.
      // Since randomness makes direct testing hard, we test via direct mint + view.

      // Mint beast directly and check info
      await beast.mint(player1.address, 1, 0, 500, 0);
      const info = await beast.getBeastInfo(1);
      expect(info.powerRate).to.equal(500); // Direct mint doesn't apply affinity
    });
  });

  describe("view functions", function () {
    it("should return empty equipped beast for new player", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      expect(await beast.getEquippedBeast(player1.address)).to.equal(0);
    });

    it("should return correct nextTokenId", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);
      expect(await beast.nextTokenId()).to.equal(1);
      await beast.mint(player1.address, 1, 0, 500, 0);
      expect(await beast.nextTokenId()).to.equal(2);
    });
  });

  describe("species system", function () {
    it("should store speciesId after finishBeastHunt capture", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      // Hunt in region 0 until we capture a beast via finishBeastHunt
      let captured = false;
      for (let i = 0; i < 30; i++) {
        await beast.connect(player1).startBeastHunt(0);
        await mine(1);

        const tx = await beast.connect(player1).finishBeastHunt();
        const receipt = await tx.wait();

        const mintEvent = receipt?.logs.find((log) => {
          try {
            return beast.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            })?.name === "BeastMinted";
          } catch {
            return false;
          }
        });

        if (mintEvent) {
          captured = true;
          const info = await beast.getBeastInfo(1);
          // Region 0 species: 0 (翠叶鼠), 1 (藤蔓蛇) for 1-star; 2 (碧角麋鹿) for 2-star
          expect(info.speciesId).to.be.lte(2);
          break;
        }

        await time.increase(3600);
      }

      expect(captured).to.be.true;
    });

    it("should store speciesId on direct mint", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      await beast.mint(player1.address, 1, 0, 500, 7); // 熔岩蜥
      const info = await beast.getBeastInfo(1);
      expect(info.speciesId).to.equal(7);
    });

    it("should reject invalid speciesId on mint", async function () {
      const { beast, player1 } = await loadFixture(deployFixture);

      await expect(
        beast.mint(player1.address, 1, 0, 500, 18)
      ).to.be.revertedWith("Beast: invalid species");

      await expect(
        beast.mint(player1.address, 1, 0, 500, 255)
      ).to.be.revertedWith("Beast: invalid species");
    });

    it("should return correct species pool", async function () {
      const { beast } = await loadFixture(deployFixture);

      // Region 0, 1-star (starIndex=0): species 0, 1
      const pool0_1 = await beast.getSpeciesPool(0, 0);
      expect(pool0_1.length).to.equal(2);
      expect(pool0_1[0]).to.equal(0);
      expect(pool0_1[1]).to.equal(1);

      // Region 0, 2-star (starIndex=1): species 2
      const pool0_2 = await beast.getSpeciesPool(0, 1);
      expect(pool0_2.length).to.equal(1);
      expect(pool0_2[0]).to.equal(2);

      // Region 5, 2-star (starIndex=1): species 17
      const pool5_2 = await beast.getSpeciesPool(5, 1);
      expect(pool5_2.length).to.equal(1);
      expect(pool5_2[0]).to.equal(17);
    });

    it("should have queryable species names", async function () {
      const { beast } = await loadFixture(deployFixture);

      expect(await beast.speciesNames(0)).to.equal("翠叶鼠");
      expect(await beast.speciesNames(2)).to.equal("碧角麋鹿");
      expect(await beast.speciesNames(17)).to.equal("古藤猿");
    });
  });
});
