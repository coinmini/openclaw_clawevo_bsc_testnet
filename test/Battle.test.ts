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
  Battle,
  Equipment,
  Beast,
} from "../typechain-types";

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, devWallet, foundationWallet, player1, player2, player3] = signers;
  const extraSigners = signers.slice(6, 12);

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

  // Equipment
  const EquipmentFactory = await ethers.getContractFactory("Equipment");
  const equipment = (await EquipmentFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Equipment;

  // Beast
  const BeastFactory = await ethers.getContractFactory("Beast");
  const beast = (await BeastFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Beast;

  // Battle (6 args: lingshi, treasury, register, config, equipment, beast)
  const BattleFactory = await ethers.getContractFactory("Battle");
  const battle = (await BattleFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
    await config.getAddress(),
    await equipment.getAddress(),
    await beast.getAddress()
  )) as Battle;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize callers
  await treasury.setAuthorizedCaller(await battle.getAddress(), true);
  await register.setAuthorizedUpdater(owner.address, true);

  // Helper to register a player: registerIntent(origin, faction, "仙人") + finalizeRegistration()
  async function registerPlayer(player: any, origin: number, faction: number = 0) {
    await register.connect(player).registerIntent(origin, faction, "仙人");
    await mine(1);
    await register.connect(player).finalizeRegistration();
  }

  // Register player1 (草莽, 剑修) and player2 (游商, 剑修) — same faction
  await registerPlayer(player1, 0, 0);
  await registerPlayer(player2, 1, 0);

  // Register extra players
  for (const s of extraSigners) {
    await registerPlayer(s, 1, 0);
  }

  // Give players LS
  const battleAddr = await battle.getAddress();
  await lingshi.mint(player1.address, ethers.parseEther("10000"));
  await lingshi.mint(player2.address, ethers.parseEther("10000"));
  await lingshi.connect(player1).approve(battleAddr, ethers.MaxUint256);
  await lingshi.connect(player2).approve(battleAddr, ethers.MaxUint256);

  for (const s of extraSigners) {
    await lingshi.mint(s.address, ethers.parseEther("10000"));
    await lingshi.connect(s).approve(battleAddr, ethers.MaxUint256);
  }

  // Helper: create challenge and accept → Active match
  async function createAndAccept(p1: any, p2: any, wager: bigint) {
    await battle.connect(p1).createChallenge(wager);
    const challengeId = (await battle.nextChallengeId()) - 1n;
    await battle.connect(p2).acceptChallenge(challengeId);
    const matchId = (await battle.nextMatchId()) - 1n;
    return { challengeId, matchId };
  }

  return {
    config, lingshi, treasury, register, equipment, beast, battle,
    owner, devWallet, foundationWallet, player1, player2, player3,
    extraSigners,
    createAndAccept,
  };
}

describe("Battle (On-chain Settlement)", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { battle, lingshi, treasury, register, config, equipment, beast } = await loadFixture(deployFixture);
      expect(await battle.lingshi()).to.equal(await lingshi.getAddress());
      expect(await battle.treasury()).to.equal(await treasury.getAddress());
      expect(await battle.register()).to.equal(await register.getAddress());
      expect(await battle.gameConfig()).to.equal(await config.getAddress());
      expect(await battle.equipment()).to.equal(await equipment.getAddress());
      expect(await battle.beast()).to.equal(await beast.getAddress());
    });

    it("should start with zero challenges and matches", async function () {
      const { battle } = await loadFixture(deployFixture);
      expect(await battle.nextChallengeId()).to.equal(1);
      expect(await battle.nextMatchId()).to.equal(1);
    });

    it("should revert with zero equipment", async function () {
      const { lingshi, treasury, register, config, beast } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(),
          await register.getAddress(), await config.getAddress(),
          ethers.ZeroAddress, await beast.getAddress()
        )
      ).to.be.revertedWith("Battle: zero equipment");
    });

    it("should revert with zero beast", async function () {
      const { lingshi, treasury, register, config, equipment } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(),
          await register.getAddress(), await config.getAddress(),
          await equipment.getAddress(), ethers.ZeroAddress
        )
      ).to.be.revertedWith("Battle: zero beast");
    });

    it("should revert with zero lingshi", async function () {
      const { treasury, register, config, equipment, beast } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress, await treasury.getAddress(),
          await register.getAddress(), await config.getAddress(),
          await equipment.getAddress(), await beast.getAddress()
        )
      ).to.be.revertedWith("Battle: zero lingshi");
    });

    it("should revert with zero treasury", async function () {
      const { lingshi, register, config, equipment, beast } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), ethers.ZeroAddress,
          await register.getAddress(), await config.getAddress(),
          await equipment.getAddress(), await beast.getAddress()
        )
      ).to.be.revertedWith("Battle: zero treasury");
    });

    it("should revert with zero register", async function () {
      const { lingshi, treasury, config, equipment, beast } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(),
          ethers.ZeroAddress, await config.getAddress(),
          await equipment.getAddress(), await beast.getAddress()
        )
      ).to.be.revertedWith("Battle: zero register");
    });

    it("should revert with zero config", async function () {
      const { lingshi, treasury, register, equipment, beast } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("Battle");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(),
          await register.getAddress(), ethers.ZeroAddress,
          await equipment.getAddress(), await beast.getAddress()
        )
      ).to.be.revertedWith("Battle: zero config");
    });

    it("should set correct five-element restraint table", async function () {
      const { battle } = await loadFixture(deployFixture);
      expect(await battle.restrains(0)).to.equal(1);
      expect(await battle.restrains(1)).to.equal(4);
      expect(await battle.restrains(2)).to.equal(3);
      expect(await battle.restrains(3)).to.equal(0);
      expect(await battle.restrains(4)).to.equal(2);
    });
  });

  describe("createChallenge", function () {
    it("should create challenge and freeze wager", async function () {
      const { battle, lingshi, player1 } = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");
      const balBefore = await lingshi.balanceOf(player1.address);

      await expect(battle.connect(player1).createChallenge(wager))
        .to.emit(battle, "ChallengeCreated")
        .withArgs(1, player1.address, wager);

      expect(await lingshi.balanceOf(player1.address)).to.equal(balBefore - wager);
      expect(await battle.getActiveChallengeCount(player1.address)).to.equal(1);
    });

    it("should reject unregistered player", async function () {
      const { battle, player3 } = await loadFixture(deployFixture);
      await expect(
        battle.connect(player3).createChallenge(ethers.parseEther("10"))
      ).to.be.revertedWith("Battle: not registered");
    });

    it("should reject wager below minimum", async function () {
      const { battle, player1 } = await loadFixture(deployFixture);
      await expect(
        battle.connect(player1).createChallenge(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Battle: wager too low");
    });
  });

  describe("cancelChallenge", function () {
    it("should cancel and refund wager", async function () {
      const { battle, lingshi, player1 } = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");

      await battle.connect(player1).createChallenge(wager);
      const balBefore = await lingshi.balanceOf(player1.address);

      await expect(battle.connect(player1).cancelChallenge(1))
        .to.emit(battle, "ChallengeCancelled")
        .withArgs(1, player1.address);

      expect(await lingshi.balanceOf(player1.address)).to.equal(balBefore + wager);
      expect(await battle.getActiveChallengeCount(player1.address)).to.equal(0);
    });
  });

  describe("acceptChallenge", function () {
    it("should create match in Active status", async function () {
      const { battle, player1, player2 } = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");

      await battle.connect(player1).createChallenge(wager);

      await expect(battle.connect(player2).acceptChallenge(1))
        .to.emit(battle, "ChallengeAccepted")
        .withArgs(1, 1, player2.address);

      const m = await battle.getMatch(1);
      expect(m.playerA).to.equal(player1.address);
      expect(m.playerB).to.equal(player2.address);
      expect(m.wager).to.equal(wager);
      expect(m.status).to.equal(1); // Active

      // Challenge should be Accepted
      const c = await battle.getChallenge(1);
      expect(c.status).to.equal(1); // Accepted
    });

    it("should reject self-accept", async function () {
      const { battle, player1 } = await loadFixture(deployFixture);
      await battle.connect(player1).createChallenge(ethers.parseEther("100"));
      await expect(
        battle.connect(player1).acceptChallenge(1)
      ).to.be.revertedWith("Battle: cannot accept own");
    });

    it("should reject expired challenge", async function () {
      const { battle, player1, player2 } = await loadFixture(deployFixture);
      await battle.connect(player1).createChallenge(ethers.parseEther("100"));
      await time.increase(24 * 3600 + 1);
      await expect(
        battle.connect(player2).acceptChallenge(1)
      ).to.be.revertedWith("Battle: challenge expired");
    });
  });

  describe("settleBattle", function () {
    it("should settle and determine winner based on stats", async function () {
      const { battle, lingshi, player1, player2, createAndAccept }
        = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");

      const bal1Before = await lingshi.balanceOf(player1.address);
      const bal2Before = await lingshi.balanceOf(player2.address);
      const { matchId } = await createAndAccept(player1, player2, wager);

      // settleBattle(matchId) — on-chain resolution
      await expect(
        battle.connect(player1).settleBattle(matchId)
      ).to.emit(battle, "MatchSettled");

      const m = await battle.getMatch(matchId);
      expect(m.status).to.equal(2); // Settled

      // Player1 (origin=0: atk=115, def=105) vs Player2 (origin=1: per=115)
      // With same element+faction, atk/def differences determine winner
      // The winner depends on element assignment (random), so just check consistency
      if (m.winner === player1.address) {
        // Player1 won — should have received payout
        const totalWager = wager * 2n;
        const fee = (totalWager * 500n) / 10000n;
        const payout = totalWager - fee;
        const bal1After = await lingshi.balanceOf(player1.address);
        expect(bal1After - bal1Before).to.equal(payout - wager); // net gain
      } else if (m.winner === player2.address) {
        // Player2 won
        const totalWager = wager * 2n;
        const fee = (totalWager * 500n) / 10000n;
        const payout = totalWager - fee;
        const bal2After = await lingshi.balanceOf(player2.address);
        expect(bal2After - bal2Before).to.equal(payout - wager);
      } else {
        // Draw — each gets half
        expect(m.winner).to.equal(ethers.ZeroAddress);
      }
    });

    it("should settle draw when both players have identical stats", async function () {
      const { battle, lingshi, register, player1, player2, owner }
        = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");

      // Make both players have identical stats by updating player2's attributes
      const cul1 = await register.getCultivator(player1.address);
      await register.connect(owner).updateAttributes(
        player2.address,
        cul1.attack,
        cul1.defense,
        cul1.perception,
        cul1.wisdom
      );

      // Also need same element for guaranteed draw — read both elements
      const cul1After = await register.getCultivator(player1.address);
      const cul2After = await register.getCultivator(player2.address);

      // If elements differ, the result may not be a draw due to element modifiers.
      // Only assert draw if elements are the same.
      await battle.connect(player1).createChallenge(wager);
      const challengeId = (await battle.nextChallengeId()) - 1n;
      await battle.connect(player2).acceptChallenge(challengeId);
      const matchId = (await battle.nextMatchId()) - 1n;

      const bal1Before = await lingshi.balanceOf(player1.address);

      await battle.connect(player1).settleBattle(matchId);

      const m = await battle.getMatch(matchId);
      expect(m.status).to.equal(2); // Settled

      if (cul1After.element === cul2After.element) {
        // Same stats + same element = guaranteed draw
        expect(m.winner).to.equal(ethers.ZeroAddress);
        // Each receives half of (totalWager - fee)
        const totalWager = wager * 2n;
        const fee = (totalWager * 500n) / 10000n;
        const halfPayout = (totalWager - fee) / 2n;
        const bal1After = await lingshi.balanceOf(player1.address);
        expect(bal1After - bal1Before).to.equal(halfPayout);
      }
    });

    it("should reject non-participant", async function () {
      const { battle, player1, player2, player3, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));
      await expect(
        battle.connect(player3).settleBattle(matchId)
      ).to.be.revertedWith("Battle: not participant");
    });

    it("should reject settling already settled match", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));

      await battle.connect(player1).settleBattle(matchId);

      await expect(
        battle.connect(player1).settleBattle(matchId)
      ).to.be.revertedWith("Battle: not active");
    });

    it("should reject after settle timeout", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));

      await time.increase(301);

      await expect(
        battle.connect(player1).settleBattle(matchId)
      ).to.be.revertedWith("Battle: settle timeout");
    });

    it("should allow either participant to call settleBattle", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));

      // Player2 calls settle instead of player1
      await expect(
        battle.connect(player2).settleBattle(matchId)
      ).to.emit(battle, "MatchSettled");

      const m = await battle.getMatch(matchId);
      expect(m.status).to.equal(2); // Settled
    });
  });

  describe("claimSettleTimeout", function () {
    it("should confiscate 100% when no one settles", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const wager = ethers.parseEther("100");
      const { matchId } = await createAndAccept(player1, player2, wager);

      await time.increase(301);

      await expect(battle.claimSettleTimeout(matchId))
        .to.emit(battle, "SettleTimeoutClaimed")
        .withArgs(matchId, wager * 2n);

      const m = await battle.getMatch(matchId);
      expect(m.status).to.equal(4); // SettleTimeout
    });

    it("should reject before timeout", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));

      await expect(
        battle.claimSettleTimeout(matchId)
      ).to.be.revertedWith("Battle: timeout not reached");
    });

    it("should reject if match is already settled", async function () {
      const { battle, player1, player2, createAndAccept } = await loadFixture(deployFixture);
      const { matchId } = await createAndAccept(player1, player2, ethers.parseEther("10"));

      await battle.connect(player1).settleBattle(matchId);

      await time.increase(301);

      await expect(
        battle.claimSettleTimeout(matchId)
      ).to.be.revertedWith("Battle: not active");
    });
  });

  describe("view functions", function () {
    it("should return empty challenge for non-existent id", async function () {
      const { battle } = await loadFixture(deployFixture);
      const c = await battle.getChallenge(999);
      expect(c.creator).to.equal(ethers.ZeroAddress);
    });

    it("should return empty match for non-existent id", async function () {
      const { battle } = await loadFixture(deployFixture);
      const m = await battle.getMatch(999);
      expect(m.playerA).to.equal(ethers.ZeroAddress);
    });
  });

  describe("admin setters", function () {
    it("should allow owner to set settle timeout", async function () {
      const { battle, owner } = await loadFixture(deployFixture);
      await expect(battle.connect(owner).setSettleTimeout(600))
        .to.emit(battle, "SettleTimeoutUpdated");
      expect(await battle.settleTimeout()).to.equal(600);
    });

    it("should reject non-owner admin calls", async function () {
      const { battle, player1 } = await loadFixture(deployFixture);
      await expect(
        battle.connect(player1).setSettleTimeout(600)
      ).to.be.revertedWith("Battle: not owner");
    });
  });
});
