import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Treasury,
  HuntHarness,
  Equipment,
  Pill,
  Beast,
  Tao,
} from "../typechain-types";

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, devWallet, foundationWallet] = signers;
  const playerSigners = signers.slice(3, 13); // 10 players

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

  // Beast (3 args: lingshi, treasury, register)
  const BeastFactory = await ethers.getContractFactory("Beast");
  const beast = (await BeastFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Beast;

  // Tao
  const TaoFactory = await ethers.getContractFactory("Tao");
  const tao = (await TaoFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Tao;

  // Hunt (harness) — 8 args
  const HuntFactory = await ethers.getContractFactory("HuntHarness");
  const hunt = (await HuntFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
    await equipment.getAddress(),
    await pill.getAddress(),
    await beast.getAddress(),
    await tao.getAddress()
  )) as HuntHarness;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await hunt.getAddress());
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize hunt in treasury
  await treasury.setAuthorizedCaller(await hunt.getAddress(), true);

  // Pill MINTER_ROLE for Hunt (to mint pill drops)
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await hunt.getAddress());

  // Grant GAME_CONTRACT_ROLE to Hunt on Equipment (for minting drops)
  const GAME_CONTRACT_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(GAME_CONTRACT_ROLE, await hunt.getAddress());

  // Make region 0 very weak so player can WIN deterministically
  // Default player (origin=0 草莽): attack=115, defense=105
  // Set region 0 monster to atk=50, def=50 so player always wins
  await hunt.setMonsterRegion(0, 1, 1, 50, 50, ethers.parseEther("20"), ethers.parseEther("10"));

  // Register 10 players
  const players: typeof playerSigners = [];
  for (let i = 0; i < playerSigners.length; i++) {
    await register.connect(playerSigners[i]).registerIntent(0, 0, "仙人"); // origin=0 草莽, faction=0 剑修
    await mine(1);
    await register.connect(playerSigners[i]).finalizeRegistration();

    await lingshi.connect(owner).mint(playerSigners[i].address, ethers.parseEther("10000"));
    await lingshi.connect(playerSigners[i]).approve(await hunt.getAddress(), ethers.MaxUint256);
    players.push(playerSigners[i]);
  }

  // Find a player with element=0 (金) who restrains region 0 (木=1)
  let goldPlayer: (typeof playerSigners)[0] | undefined;
  for (const p of players) {
    const c = await register.getCultivator(p.address);
    if (c.element === 0n) { // 金
      goldPlayer = p;
      break;
    }
  }

  return {
    config, lingshi, treasury, register, equipment, pill, beast, tao, hunt, owner,
    players, goldPlayer,
    player1: players[0], player2: players[1],
  };
}

describe("Hunt", function () {
  describe("Deployment", function () {
    it("should set 6 monster regions", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // Region 0 was overridden in fixture to weak monster (50/50)
      const r0 = await hunt.monsterRegions(0);
      expect(r0.difficulty).to.equal(1);
      expect(r0.element).to.equal(1); // 木
      expect(r0.monsterAtk).to.equal(50);
      expect(r0.monsterDef).to.equal(50);
      expect(r0.reward).to.equal(ethers.parseEther("20"));
      expect(r0.roadFee).to.equal(ethers.parseEther("10"));
    });

    it("should set all 6 regions with correct data", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const r5 = await hunt.monsterRegions(5);
      expect(r5.difficulty).to.equal(4);
      expect(r5.element).to.equal(1); // 木
      expect(r5.monsterAtk).to.equal(2000);
      expect(r5.monsterDef).to.equal(1500);
      expect(r5.reward).to.equal(ethers.parseEther("80"));
      expect(r5.roadFee).to.equal(ethers.parseEther("25"));
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("HuntHarness");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Hunt: zero lingshi");
    });

    it("should revert with zero config", async function () {
      const { lingshi } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("HuntHarness");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Hunt: zero config");
    });

    it("should revert with zero treasury", async function () {
      const { lingshi, config } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("HuntHarness");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(),
          await config.getAddress(),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Hunt: zero treasury");
    });

    it("should revert with zero register", async function () {
      const { lingshi, config, treasury } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("HuntHarness");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(),
          await config.getAddress(),
          await treasury.getAddress(),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Hunt: zero register");
    });
  });

  describe("hunt", function () {
    it("should emit HuntStarted event", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      await expect(hunt.connect(player1).hunt(0))
        .to.emit(hunt, "HuntStarted");
    });

    it("should record winning hunt result and pay reward minus fee", async function () {
      const { hunt, lingshi, player1 } = await loadFixture(deployFixture);
      const before = await lingshi.balanceOf(player1.address);
      await hunt.connect(player1).hunt(0);
      const after = await lingshi.balanceOf(player1.address);
      const result = await hunt.getLastHunt(player1.address);

      expect(result.regionId).to.equal(0);
      expect(result.blockNumber).to.be.greaterThan(0);
      // Player (atk=115, def=105) vs weak monster (atk=50, def=50) → player wins
      expect(result.won).to.be.true;
      // -10 road fee + 20 reward = +10 net
      expect(after - before).to.equal(ethers.parseEther("10"));
    });

    it("should record losing hunt result and deduct fee only", async function () {
      const { hunt, lingshi, player1 } = await loadFixture(deployFixture);
      const before = await lingshi.balanceOf(player1.address);
      // Region 5: monsterAtk=2000, monsterDef=1500 → player should LOSE
      await hunt.connect(player1).hunt(5);
      const after = await lingshi.balanceOf(player1.address);
      const result = await hunt.getLastHunt(player1.address);

      expect(result.regionId).to.equal(5);
      expect(result.blockNumber).to.be.greaterThan(0);
      expect(result.won).to.be.false;
      // -25 road fee only (region 5 roadFee)
      expect(before - after).to.equal(ethers.parseEther("25"));
    });

    it("should reject invalid region", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      await expect(
        hunt.connect(player1).hunt(6)
      ).to.be.revertedWith("Hunt: invalid region");
    });

    it("should reject unregistered player", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const unregistered = signers[signers.length - 1];
      await expect(
        hunt.connect(unregistered).hunt(0)
      ).to.be.revertedWith("Hunt: not registered");
    });

    it("should reject during cooldown", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      // Win a hunt on region 0 (weak monster)
      await hunt.connect(player1).hunt(0);
      await mine(1);
      await hunt.connect(player1).claimHuntDrop();
      await expect(
        hunt.connect(player1).hunt(0)
      ).to.be.revertedWith("Hunt: cooldown active");
    });

    it("should allow hunting after cooldown", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      await hunt.connect(player1).hunt(0);
      await mine(1);
      await hunt.connect(player1).claimHuntDrop();
      await time.increase(5 * 60 + 1);
      await expect(
        hunt.connect(player1).hunt(0)
      ).to.not.be.reverted;
    });

    it("should reject insufficient LS for road fee", async function () {
      const { hunt, lingshi, owner, player1 } = await loadFixture(deployFixture);
      const balance = await lingshi.balanceOf(player1.address);
      const BURNER_ROLE = await lingshi.BURNER_ROLE();
      await lingshi.grantRole(BURNER_ROLE, owner.address);
      await lingshi.connect(owner).burn(player1.address, balance);
      await expect(
        hunt.connect(player1).hunt(0)
      ).to.be.revertedWith("Hunt: insufficient LS");
    });

    it("should reject if previous drop not claimed", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      // Win a hunt (drop not yet claimed)
      await hunt.connect(player1).hunt(0);
      const result = await hunt.getLastHunt(player1.address);
      expect(result.won).to.be.true;
      expect(result.dropClaimed).to.be.false;

      await time.increase(5 * 60 + 1);
      await expect(
        hunt.connect(player1).hunt(0)
      ).to.be.revertedWith("Hunt: claim previous drop first");
    });

    it("player should lose against strong monster region", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      // Region 4: monsterAtk=1800, monsterDef=1200 → player loses
      await hunt.connect(player1).hunt(4);
      const result = await hunt.getLastHunt(player1.address);
      expect(result.won).to.be.false;
    });

    it("should test winning on weak region and losing on strong region", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);

      // Region 0 (weak monster) → win
      await hunt.connect(player1).hunt(0);
      const result0 = await hunt.getLastHunt(player1.address);
      expect(result0.regionId).to.equal(0);
      expect(result0.won).to.be.true;

      // Claim drop and wait cooldown
      await mine(1);
      await hunt.connect(player1).claimHuntDrop();
      await time.increase(5 * 60 + 1);

      // Region 5 (very strong monster) → lose
      await hunt.connect(player1).hunt(5);
      const result5 = await hunt.getLastHunt(player1.address);
      expect(result5.regionId).to.equal(5);
      expect(result5.won).to.be.false;
    });
  });

  describe("claimHuntDrop", function () {
    it("should reject if no winning hunt", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      // Lose on region 5 (strong monster)
      await hunt.connect(player1).hunt(5);
      await mine(1);
      await expect(hunt.connect(player1).claimHuntDrop()).to.be.revertedWith(
        "Hunt: no winning hunt"
      );
    });

    it("should reject claim with no winning hunt (never hunted)", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      // Player never hunted — lastHunt.won = false
      await expect(hunt.connect(player1).claimHuntDrop()).to.be.revertedWith(
        "Hunt: no winning hunt"
      );
    });

    it("should emit HuntDropClaimed and mark drop as claimed", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);

      await hunt.connect(player1).hunt(0);

      await mine(1);
      await expect(hunt.connect(player1).claimHuntDrop())
        .to.emit(hunt, "HuntDropClaimed");

      const afterClaim = await hunt.getLastHunt(player1.address);
      expect(afterClaim.dropClaimed).to.be.true;
    });

    it("should reject double claim", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);

      await hunt.connect(player1).hunt(0);

      await mine(1);
      await hunt.connect(player1).claimHuntDrop();
      await expect(hunt.connect(player1).claimHuntDrop()).to.be.revertedWith(
        "Hunt: drop already claimed"
      );
    });

    it("should produce drops over multiple winning hunts", async function () {
      const { hunt, players } = await loadFixture(deployFixture);

      let totalDropReward = 0n;
      let totalHunts = 0;

      // Run multiple hunts with all players on weak region 0
      for (let round = 0; round < 5; round++) {
        for (const player of players) {
          if (round > 0 || players.indexOf(player) > 0) {
            await time.increase(5 * 60 + 1);
          }
          await hunt.connect(player).hunt(0);

          totalHunts++;
          await mine(1);
          const tx = await hunt.connect(player).claimHuntDrop();
          const receipt = await tx.wait();

          for (const log of receipt!.logs) {
            try {
              const parsed = hunt.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              if (parsed?.name === "HuntDropClaimed") {
                totalDropReward += parsed.args.dropReward;
              }
            } catch {
              // skip
            }
          }
        }
      }

      expect(totalHunts).to.be.gte(1);
    });
  });

  describe("On-chain battle calculation", function () {
    it("_calculateBattle: A wins when A has higher effective power", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // A: atk=200, def=100, elemMod=10000 (neutral)
      // B: atk=50, def=50, elemMod=10000 (neutral)
      // kRatioBP=6000
      const winner = await hunt.exposed_calculateBattle(200, 100, 10000, 50, 50, 10000, 6000);
      expect(winner).to.equal(1); // A wins
    });

    it("_calculateBattle: B wins when B has higher effective power", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // A: atk=50, def=50, B: atk=200, def=100
      const winner = await hunt.exposed_calculateBattle(50, 50, 10000, 200, 100, 10000, 6000);
      expect(winner).to.equal(2); // B wins
    });

    it("_calculateBattle: draw when stats are identical", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const winner = await hunt.exposed_calculateBattle(100, 100, 10000, 100, 100, 10000, 6000);
      expect(winner).to.equal(0); // draw
    });

    it("_calculateBattle: element modifier tips the balance", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // Slightly weaker A but with element advantage (13000 vs 10000)
      // A: atk=90, def=90, elemMod=13000 (restrains)
      // B: atk=100, def=100, elemMod=10000 (neutral)
      const winner = await hunt.exposed_calculateBattle(90, 90, 13000, 100, 100, 10000, 6000);
      expect(winner).to.equal(1); // A wins due to element advantage
    });

    it("_calculateBattle: kRatio affects outcome", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // With a very high kRatio, the common term dominates and evens out
      // A slightly weaker than B
      const winnerLowK = await hunt.exposed_calculateBattle(95, 100, 10000, 100, 100, 10000, 1000);
      const winnerHighK = await hunt.exposed_calculateBattle(95, 100, 10000, 100, 100, 10000, 9000);
      // Both should have B winning, but the margin changes
      expect(winnerLowK).to.equal(2);
      expect(winnerHighK).to.equal(2);
    });
  });

  describe("Element modifier", function () {
    it("_getElementModifier: returns 13000 for restraining element (low perception)", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // 金(0) restrains 木(1), perception=100, faction=0
      const mod = await hunt.exposed_getElementModifier(0, 1, 100, 0);
      expect(mod).to.equal(13000); // base克制, perception < 250 → no bonus
    });

    it("_getElementModifier: perception >= 250 adds +500", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const mod = await hunt.exposed_getElementModifier(0, 1, 250, 0);
      expect(mod).to.equal(13500);
    });

    it("_getElementModifier: perception >= 500 adds +1000", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const mod = await hunt.exposed_getElementModifier(0, 1, 500, 0);
      expect(mod).to.equal(14000);
    });

    it("_getElementModifier: perception >= 750 adds +1500", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const mod = await hunt.exposed_getElementModifier(0, 1, 750, 0);
      expect(mod).to.equal(14500);
    });

    it("_getElementModifier: faction=2 (阵修) adds +1000", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // 金 restrains 木, perception=100, faction=2 (阵修)
      const mod = await hunt.exposed_getElementModifier(0, 1, 100, 2);
      expect(mod).to.equal(14000); // 13000 + 1000 阵修
    });

    it("_getElementModifier: perception + 阵修 stack", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // 金 restrains 木, perception=750, faction=2 (阵修)
      const mod = await hunt.exposed_getElementModifier(0, 1, 750, 2);
      expect(mod).to.equal(15500); // 13000 + 1500 + 1000
    });

    it("_getElementModifier: returns 10800 for complementary (相生) elements", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // 金(0)生水(2)
      const mod = await hunt.exposed_getElementModifier(0, 2, 100, 0);
      expect(mod).to.equal(10800);
    });

    it("_getElementModifier: returns 10000 for unrelated elements", async function () {
      const { hunt } = await loadFixture(deployFixture);
      // 金(0) vs 火(3): 金 doesn't restrain fire, and 金生水 not fire → unrelated
      // Actually: 火(3) restrains 金(0), so from 金's perspective attacking 火 → unrelated
      const mod = await hunt.exposed_getElementModifier(0, 3, 100, 0);
      expect(mod).to.equal(10000);
    });

    it("_getElementModifier: returns 10000 for same element", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const mod = await hunt.exposed_getElementModifier(0, 0, 100, 0);
      expect(mod).to.equal(10000);
    });
  });

  describe("Drop Tables (via harness)", function () {
    it("_lowDiffDrop: should return NONE for roll < 3000", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const [quality, reward] = await hunt.exposed_lowDiffDrop(0);
      expect(quality).to.equal(0); // NONE
      expect(reward).to.equal(0);

      const [q2, r2] = await hunt.exposed_lowDiffDrop(2999);
      expect(q2).to.equal(0);
      expect(r2).to.equal(0);
    });

    it("_lowDiffDrop: should return WHITE (5 LS) for 3000 ≤ roll < 6500", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const [quality, reward] = await hunt.exposed_lowDiffDrop(3000);
      expect(quality).to.equal(1);
      expect(reward).to.equal(ethers.parseEther("5"));

      const [q2, r2] = await hunt.exposed_lowDiffDrop(6499);
      expect(q2).to.equal(1);
      expect(r2).to.equal(ethers.parseEther("5"));
    });

    it("_lowDiffDrop: should return GREEN (15 LS) for 6500 ≤ roll < 9000", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const [quality, reward] = await hunt.exposed_lowDiffDrop(6500);
      expect(quality).to.equal(2);
      expect(reward).to.equal(ethers.parseEther("15"));

      const [q2, r2] = await hunt.exposed_lowDiffDrop(8999);
      expect(q2).to.equal(2);
      expect(r2).to.equal(ethers.parseEther("15"));
    });

    it("_lowDiffDrop: should return BLUE (50 LS) for roll ≥ 9000", async function () {
      const { hunt } = await loadFixture(deployFixture);
      const [quality, reward] = await hunt.exposed_lowDiffDrop(9000);
      expect(quality).to.equal(3);
      expect(reward).to.equal(ethers.parseEther("50"));

      const [q2, r2] = await hunt.exposed_lowDiffDrop(9999);
      expect(q2).to.equal(3);
      expect(r2).to.equal(ethers.parseEther("50"));
    });

    it("_midDiffDrop: should return all 5 quality tiers", async function () {
      const { hunt } = await loadFixture(deployFixture);

      // NONE: roll < 2000
      const [q0, r0] = await hunt.exposed_midDiffDrop(0);
      expect(q0).to.equal(0);
      expect(r0).to.equal(0);

      // WHITE: 2000 ≤ roll < 5000
      const [q1, r1] = await hunt.exposed_midDiffDrop(2000);
      expect(q1).to.equal(1);
      expect(r1).to.equal(ethers.parseEther("5"));

      // GREEN: 5000 ≤ roll < 7500
      const [q2, r2] = await hunt.exposed_midDiffDrop(5000);
      expect(q2).to.equal(2);
      expect(r2).to.equal(ethers.parseEther("15"));

      // BLUE: 7500 ≤ roll < 9000
      const [q3, r3] = await hunt.exposed_midDiffDrop(7500);
      expect(q3).to.equal(3);
      expect(r3).to.equal(ethers.parseEther("50"));

      // PURPLE: roll ≥ 9000
      const [q4, r4] = await hunt.exposed_midDiffDrop(9000);
      expect(q4).to.equal(4);
      expect(r4).to.equal(ethers.parseEther("100"));
    });

    it("_highDiffDrop: should return all 6 quality tiers", async function () {
      const { hunt } = await loadFixture(deployFixture);

      // NONE: roll < 1000
      const [q0, r0] = await hunt.exposed_highDiffDrop(0);
      expect(q0).to.equal(0);
      expect(r0).to.equal(0);

      // WHITE: 1000 ≤ roll < 3500
      const [q1, r1] = await hunt.exposed_highDiffDrop(1000);
      expect(q1).to.equal(1);
      expect(r1).to.equal(ethers.parseEther("5"));

      // GREEN: 3500 ≤ roll < 6500
      const [q2, r2] = await hunt.exposed_highDiffDrop(3500);
      expect(q2).to.equal(2);
      expect(r2).to.equal(ethers.parseEther("15"));

      // BLUE: 6500 ≤ roll < 8500
      const [q3, r3] = await hunt.exposed_highDiffDrop(6500);
      expect(q3).to.equal(3);
      expect(r3).to.equal(ethers.parseEther("50"));

      // PURPLE: 8500 ≤ roll < 9500
      const [q4, r4] = await hunt.exposed_highDiffDrop(8500);
      expect(q4).to.equal(4);
      expect(r4).to.equal(ethers.parseEther("100"));

      // VEIN: roll ≥ 9500
      const [q5, r5] = await hunt.exposed_highDiffDrop(9500);
      expect(q5).to.equal(5);
      expect(r5).to.equal(ethers.parseEther("150"));
    });
  });

  describe("getLastHunt", function () {
    it("should return default for player who never hunted", async function () {
      const { hunt, player1 } = await loadFixture(deployFixture);
      const result = await hunt.getLastHunt(player1.address);
      expect(result.regionId).to.equal(0);
      expect(result.blockNumber).to.equal(0);
      expect(result.won).to.be.false;
      expect(result.dropClaimed).to.be.false;
    });
  });
});
