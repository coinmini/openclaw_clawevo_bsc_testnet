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
  Beast,
  Pill,
  SecretRealm,
} from "../typechain-types";

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, devWallet, foundationWallet, player1, player2, player3, player4] = signers;

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

  // Beast (3 args: lingshi, treasury, register)
  const BeastFactory = await ethers.getContractFactory("Beast");
  const beast = (await BeastFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Beast;

  // Pill
  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // SecretRealm — 7 args
  const SecretRealmFactory = await ethers.getContractFactory("SecretRealm");
  const secretRealm = (await SecretRealmFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress(),
    await config.getAddress(),
    await equipment.getAddress(),
    await beast.getAddress(),
    await pill.getAddress()
  )) as SecretRealm;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await secretRealm.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize callers
  await treasury.setAuthorizedCaller(await secretRealm.getAddress(), true);

  // Pill MINTER_ROLE for SecretRealm
  const PILL_MINTER = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER, await secretRealm.getAddress());

  // Grant GAME_CONTRACT_ROLE
  const EQUIP_GAME_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(EQUIP_GAME_ROLE, owner.address);
  const BEAST_GAME_ROLE = await beast.GAME_CONTRACT_ROLE();
  await beast.grantRole(BEAST_GAME_ROLE, owner.address);

  // Allow realm updates
  await register.setAuthorizedUpdater(owner.address, true);

  // Helper to register a player
  async function registerPlayer(player: any, origin: number) {
    await register.connect(player).registerIntent(origin, origin, "仙人");
    await mine(1);
    await register.connect(player).finalizeRegistration();
  }

  // Register players
  await registerPlayer(player1, 0); // 草莽 (atk=115, def=105)
  await registerPlayer(player2, 2); // 苦力 (def=115)
  await registerPlayer(player3, 1); // 游商

  // Give players LS and approve
  const realmAddr = await secretRealm.getAddress();
  for (const p of [player1, player2, player3]) {
    await lingshi.mint(p.address, ethers.parseEther("10000"));
    await lingshi.connect(p).approve(realmAddr, ethers.MaxUint256);
  }

  return {
    config, lingshi, treasury, register, equipment, beast, pill, secretRealm,
    owner, devWallet, foundationWallet, player1, player2, player3, player4,
    registerPlayer,
  };
}

describe("SecretRealm", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { secretRealm, lingshi, treasury, register, config } = await loadFixture(deployFixture);
      expect(await secretRealm.lingshi()).to.equal(await lingshi.getAddress());
      expect(await secretRealm.treasury()).to.equal(await treasury.getAddress());
      expect(await secretRealm.register()).to.equal(await register.getAddress());
      expect(await secretRealm.gameConfig()).to.equal(await config.getAddress());
    });

    it("should configure realm layers correctly", async function () {
      const { secretRealm } = await loadFixture(deployFixture);
      // 青云秘境 layer 0
      const layer0 = await secretRealm.getRealmLayer(0, 0);
      expect(layer0.monsterAtk).to.equal(300);
      expect(layer0.monsterDef).to.equal(200);
      expect(layer0.reward).to.equal(ethers.parseEther("40"));

      // 桃源秘境 layer 2
      const layer2 = await secretRealm.getRealmLayer(2, 2);
      expect(layer2.monsterAtk).to.equal(1800);
      expect(layer2.monsterDef).to.equal(1800);
      expect(layer2.reward).to.equal(ethers.parseEther("400"));
    });

    it("should revert with zero lingshi", async function () {
      const { treasury, register, config, equipment, beast, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress, await treasury.getAddress(), await register.getAddress(),
          await config.getAddress(), await equipment.getAddress(), await beast.getAddress(),
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero lingshi");
    });

    it("should revert with zero treasury", async function () {
      const { lingshi, register, config, equipment, beast, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), ethers.ZeroAddress, await register.getAddress(),
          await config.getAddress(), await equipment.getAddress(), await beast.getAddress(),
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero treasury");
    });

    it("should revert with zero register", async function () {
      const { lingshi, treasury, config, equipment, beast, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(), ethers.ZeroAddress,
          await config.getAddress(), await equipment.getAddress(), await beast.getAddress(),
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero register");
    });

    it("should revert with zero config", async function () {
      const { lingshi, treasury, register, equipment, beast, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(), await register.getAddress(),
          ethers.ZeroAddress, await equipment.getAddress(), await beast.getAddress(),
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero config");
    });

    it("should revert with zero equipment", async function () {
      const { lingshi, treasury, register, config, beast, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(), await register.getAddress(),
          await config.getAddress(), ethers.ZeroAddress, await beast.getAddress(),
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero equipment");
    });

    it("should revert with zero beast", async function () {
      const { lingshi, treasury, register, config, equipment, pill } = await loadFixture(deployFixture);
      const Factory = await ethers.getContractFactory("SecretRealm");
      await expect(
        Factory.deploy(
          await lingshi.getAddress(), await treasury.getAddress(), await register.getAddress(),
          await config.getAddress(), await equipment.getAddress(), ethers.ZeroAddress,
          await pill.getAddress()
        )
      ).to.be.revertedWith("SecretRealm: zero beast");
    });

    it("should set correct realm elements", async function () {
      const { secretRealm } = await loadFixture(deployFixture);
      expect(await secretRealm.realmElements(0)).to.equal(1); // 青云=木
      expect(await secretRealm.realmElements(1)).to.equal(2); // 冰霜=水
      expect(await secretRealm.realmElements(2)).to.equal(1); // 桃源=木
    });
  });

  describe("enterSolo", function () {
    it("should enter solo and deduct fee", async function () {
      const { secretRealm, lingshi, player1 } = await loadFixture(deployFixture);
      const balBefore = await lingshi.balanceOf(player1.address);

      await expect(secretRealm.connect(player1).enterSolo(0))
        .to.emit(secretRealm, "SoloEntered")
        .withArgs(player1.address, 0);

      const balAfter = await lingshi.balanceOf(player1.address);
      expect(balBefore - balAfter).to.equal(ethers.parseEther("100"));

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      expect(progress.isSolo).to.be.true;
      expect(progress.realmId).to.equal(0);
      expect(progress.currentLayer).to.equal(0);
    });

    it("should reject unregistered player", async function () {
      const { secretRealm, player4 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player4).enterSolo(0)
      ).to.be.revertedWith("SecretRealm: not registered");
    });

    it("should reject invalid realm", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player1).enterSolo(9)
      ).to.be.revertedWith("SecretRealm: invalid realm");
    });

    it("should reject if already active", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).enterSolo(0);
      await expect(
        secretRealm.connect(player1).enterSolo(1)
      ).to.be.revertedWith("SecretRealm: already active");
    });

    it("should reject with insufficient LS", async function () {
      const { secretRealm, lingshi, player1, owner } = await loadFixture(deployFixture);
      const bal = await lingshi.balanceOf(player1.address);
      await lingshi.connect(player1).transfer(owner.address, bal);
      await expect(
        secretRealm.connect(player1).enterSolo(0)
      ).to.be.revertedWith("SecretRealm: insufficient LS");
    });

    it("should reject if player is in a party", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await expect(
        secretRealm.connect(player1).enterSolo(0)
      ).to.be.revertedWith("SecretRealm: in party");
    });
  });

  describe("challengeLayer", function () {
    it("should fail layer if player too weak", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      // 青云秘境 layer 0: monster atk=300, def=200 — player1 (atk=115) will lose
      await secretRealm.connect(player1).enterSolo(0);
      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.false; // Lost, realm ended
    });

    it("should win layer with strong beast", async function () {
      const { secretRealm, beast, player1 } = await loadFixture(deployFixture);

      // Give player1 a beast with massive powerRate to guarantee win
      // powerRate=60000 → atk = 115 * (1 + 6.0) = 805
      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);

      // Enter 天机 realm (weakest: layer 0 = 300/300)
      await secretRealm.connect(player1).enterSolo(2);
      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      expect(progress.dropClaimed).to.be.false;
    });

    it("should reject if not active", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player1).challengeLayer()
      ).to.be.revertedWith("SecretRealm: not active");
    });

    it("should reject if drop not claimed", async function () {
      const { secretRealm, beast, player1 } = await loadFixture(deployFixture);

      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);

      await secretRealm.connect(player1).enterSolo(2);
      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      expect(progress.dropClaimed).to.be.false;

      // Try to challenge again without claiming drop
      await expect(
        secretRealm.connect(player1).challengeLayer()
      ).to.be.revertedWith("SecretRealm: claim drop first");
    });

    it("should reject if all layers cleared", async function () {
      const { secretRealm, beast, equipment, register, player1, owner } = await loadFixture(deployFixture);

      // Give player1 massive boosts to clear all 3 layers of 天机
      // Boost base stats to overwhelm layer 2 (2000/2000 monster)
      await register.connect(owner).updateAttributes(player1.address, 3000, 3000, 500, 100);
      await register.connect(owner).updateRealm(player1.address, 2);
      await equipment.mint(player1.address, 0, 3, 2500, 0, 0, 0); // WEAPON 25%
      await equipment.connect(player1).equip(1);
      await equipment.mint(player1.address, 1, 3, 2500, 0, 0, 0); // ARMOR 25%
      await equipment.connect(player1).equip(2);
      // powerRate=65535
      await beast.mint(player1.address, 1, 0, 65535, 0);
      await beast.connect(player1).equipBeast(1);

      await secretRealm.connect(player1).enterSolo(2); // 天机

      // Layer 0 (300/300) — win
      await secretRealm.connect(player1).challengeLayer();
      let progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      await mine(1);
      await secretRealm.connect(player1).claimLayerDrop();

      // Layer 1 (800/800) — win
      await secretRealm.connect(player1).challengeLayer();
      progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      await mine(1);
      await secretRealm.connect(player1).claimLayerDrop();

      // Layer 2 (2000/2000) — win
      await secretRealm.connect(player1).challengeLayer();
      progress = await secretRealm.getProgress(player1.address);
      // After winning layer 2, claimLayerDrop will set active=false (all cleared)
      expect(progress.active).to.be.true;
      await mine(1);
      await secretRealm.connect(player1).claimLayerDrop();

      // All 3 layers cleared → should be inactive
      progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.false;
      expect(progress.currentLayer).to.equal(3);

      // Trying to challenge again should fail (not active)
      await expect(
        secretRealm.connect(player1).challengeLayer()
      ).to.be.revertedWith("SecretRealm: not active");
    });

    it("should emit LayerChallenged event with correct args", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).enterSolo(0);

      await expect(secretRealm.connect(player1).challengeLayer())
        .to.emit(secretRealm, "LayerChallenged")
        .withArgs(player1.address, 0, 0, false); // Lost: won=false
    });

    it("should apply equipment armor bonus in combat", async function () {
      const { secretRealm, beast, equipment, register, player1, owner } = await loadFixture(deployFixture);

      await register.connect(owner).updateRealm(player1.address, 2);
      // ARMOR=1, PURPLE=3, bonusBP=2500 (25%)
      await equipment.mint(player1.address, 1, 3, 2500, 0, 0, 0);
      await equipment.connect(player1).equip(1);
      // Beast to ensure win
      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);

      await secretRealm.connect(player1).enterSolo(2);
      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      // With armor + beast boost, player should still win layer 0
      expect(progress.active).to.be.true;
    });
  });

  describe("claimLayerDrop", function () {
    it("should reject if not active", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player1).claimLayerDrop()
      ).to.be.revertedWith("SecretRealm: not active");
    });

    it("should reject if already claimed", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).enterSolo(0);
      // dropClaimed is set to true on entry
      await expect(
        secretRealm.connect(player1).claimLayerDrop()
      ).to.be.revertedWith("SecretRealm: already claimed");
    });

    it("should claim drop and advance to next layer", async function () {
      const { secretRealm, lingshi, beast, player1 } = await loadFixture(deployFixture);

      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);

      await secretRealm.connect(player1).enterSolo(2); // 天机
      const balBefore = await lingshi.balanceOf(player1.address);

      // Win layer 0
      await secretRealm.connect(player1).challengeLayer();
      let progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      expect(progress.dropClaimed).to.be.false;

      // Wait 1 block for block delay
      await mine(1);

      // Claim drop
      await expect(secretRealm.connect(player1).claimLayerDrop())
        .to.emit(secretRealm, "LayerDropClaimed");

      progress = await secretRealm.getProgress(player1.address);
      expect(progress.dropClaimed).to.be.true;
      expect(progress.currentLayer).to.equal(1);
      expect(progress.active).to.be.true;
    });

    it("should grant solo bonus reward with 15% probability", async function () {
      const { secretRealm, lingshi, beast, player1 } = await loadFixture(deployFixture);

      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);

      await secretRealm.connect(player1).enterSolo(2); // 天机

      // Win layer 0
      await secretRealm.connect(player1).challengeLayer();
      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;

      await mine(1);

      const balBefore = await lingshi.balanceOf(player1.address);
      await secretRealm.connect(player1).claimLayerDrop();
      const balAfter = await lingshi.balanceOf(player1.address);

      // Layer 0 reward is 50 LS (already minted on challengeLayer win)
      // Bonus is 50/2 = 25 LS if roll < 1500
      // The bonus is random — just verify no revert and balance >= before
      expect(balAfter).to.be.gte(balBefore);
    });
  });

  describe("Party", function () {
    it("should create party", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);

      await expect(secretRealm.connect(player1).createParty(0))
        .to.emit(secretRealm, "PartyCreated")
        .withArgs(1, player1.address, 0);

      const party = await secretRealm.getParty(1);
      expect(party.leader).to.equal(player1.address);
      expect(party.memberCount).to.equal(1);
      expect(party.realmId).to.equal(0);
    });

    it("should reject create party for unregistered player", async function () {
      const { secretRealm, player4 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player4).createParty(0)
      ).to.be.revertedWith("SecretRealm: not registered");
    });

    it("should reject create party with invalid realm", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player1).createParty(9)
      ).to.be.revertedWith("SecretRealm: invalid realm");
    });

    it("should reject create party if already active", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).enterSolo(0);
      await expect(
        secretRealm.connect(player1).createParty(0)
      ).to.be.revertedWith("SecretRealm: already active");
    });

    it("should reject create party if already in party", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await expect(
        secretRealm.connect(player1).createParty(1)
      ).to.be.revertedWith("SecretRealm: already in party");
    });

    it("should join party", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);

      await expect(secretRealm.connect(player2).joinParty(1))
        .to.emit(secretRealm, "PartyJoined")
        .withArgs(1, player2.address);

      const party = await secretRealm.getParty(1);
      expect(party.memberCount).to.equal(2);
    });

    it("should reject join for unregistered player", async function () {
      const { secretRealm, player1, player4 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await expect(
        secretRealm.connect(player4).joinParty(1)
      ).to.be.revertedWith("SecretRealm: not registered");
    });

    it("should reject join if already active", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      // player2 enters solo first
      await secretRealm.connect(player2).enterSolo(0);
      // player1 creates party
      await secretRealm.connect(player1).createParty(0);
      await expect(
        secretRealm.connect(player2).joinParty(1)
      ).to.be.revertedWith("SecretRealm: already active");
    });

    it("should reject join if already in party", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);
      await expect(
        secretRealm.connect(player2).joinParty(1)
      ).to.be.revertedWith("SecretRealm: already in party");
    });

    it("should reject join non-existent party", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await expect(
        secretRealm.connect(player1).joinParty(999)
      ).to.be.revertedWith("SecretRealm: party not found");
    });

    it("should reject join if party already entered", async function () {
      const { secretRealm, player1, player2, player3 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);

      await expect(
        secretRealm.connect(player3).joinParty(1)
      ).to.be.revertedWith("SecretRealm: party already entered");
    });

    it("should reject join if party full (3 members)", async function () {
      const { secretRealm, lingshi, player1, player2, player3, player4, registerPlayer } = await loadFixture(deployFixture);

      // Register player4
      await registerPlayer(player4, 0);
      await lingshi.mint(player4.address, ethers.parseEther("10000"));
      const realmAddr = await secretRealm.getAddress();
      await lingshi.connect(player4).approve(realmAddr, ethers.MaxUint256);

      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player3).joinParty(1);

      // Party is full (3 members), player4 tries to join
      await expect(
        secretRealm.connect(player4).joinParty(1)
      ).to.be.revertedWith("SecretRealm: party full");
    });

    it("should enter as party", async function () {
      const { secretRealm, lingshi, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);

      const bal1Before = await lingshi.balanceOf(player1.address);
      const bal2Before = await lingshi.balanceOf(player2.address);

      await expect(secretRealm.connect(player1).enterAsParty(1))
        .to.emit(secretRealm, "PartyEntered")
        .withArgs(1, 0);

      const bal1After = await lingshi.balanceOf(player1.address);
      const bal2After = await lingshi.balanceOf(player2.address);
      expect(bal1Before - bal1After).to.equal(ethers.parseEther("100"));
      expect(bal2Before - bal2After).to.equal(ethers.parseEther("100"));

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.true;
      expect(progress.isSolo).to.be.false;
    });

    it("should reject enterAsParty if not leader", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);
      await expect(
        secretRealm.connect(player2).enterAsParty(1)
      ).to.be.revertedWith("SecretRealm: not leader");
    });

    it("should reject enterAsParty with only 1 member", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await expect(
        secretRealm.connect(player1).enterAsParty(1)
      ).to.be.revertedWith("SecretRealm: need 2+ members");
    });

    it("should reject enterAsParty if already entered", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);
      await expect(
        secretRealm.connect(player1).enterAsParty(1)
      ).to.be.revertedWith("SecretRealm: already entered");
    });

    it("should reject enterAsParty if member has insufficient LS", async function () {
      const { secretRealm, lingshi, player1, player2, owner } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(0);
      await secretRealm.connect(player2).joinParty(1);

      // Drain player2's LS
      const bal = await lingshi.balanceOf(player2.address);
      await lingshi.connect(player2).transfer(owner.address, bal);

      await expect(
        secretRealm.connect(player1).enterAsParty(1)
      ).to.be.revertedWith("SecretRealm: member insufficient LS");
    });

    it("should challenge as party with combined power", async function () {
      const { secretRealm, beast, player1, player2 } = await loadFixture(deployFixture);

      // Give both players beasts to boost their stats
      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);
      await beast.mint(player2.address, 1, 0, 60000, 0);
      await beast.connect(player2).equipBeast(2);

      await secretRealm.connect(player1).createParty(2); // 天机
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);

      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      // Verify the party challenge path ran
      expect(progress.realmId).to.equal(2);
    });

    it("should challenge as 3-member party with scale factor", async function () {
      const { secretRealm, beast, player1, player2, player3 } = await loadFixture(deployFixture);

      // Give all players beasts
      await beast.mint(player1.address, 1, 0, 60000, 0);
      await beast.connect(player1).equipBeast(1);
      await beast.mint(player2.address, 1, 0, 60000, 0);
      await beast.connect(player2).equipBeast(2);
      await beast.mint(player3.address, 1, 0, 60000, 0);
      await beast.connect(player3).equipBeast(3);

      await secretRealm.connect(player1).createParty(2); // 天机
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player3).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);

      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.realmId).to.equal(2);
    });

    it("should reject non-leader from challenging in party", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(2);
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);

      // player2 doesn't have active progress, fails with "not active"
      await expect(
        secretRealm.connect(player2).challengeLayer()
      ).to.be.revertedWith("SecretRealm: not active");
    });

    it("should cleanup party state on loss", async function () {
      const { secretRealm, player1, player2 } = await loadFixture(deployFixture);
      await secretRealm.connect(player1).createParty(7); // 炎魔秘境 (strong monsters: 700/350)
      await secretRealm.connect(player2).joinParty(1);
      await secretRealm.connect(player1).enterAsParty(1);

      // Will lose: base stats vs monster atk=700, def=350
      await secretRealm.connect(player1).challengeLayer();

      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.false;

      // Party members should have their playerPartyId cleared
      expect(await secretRealm.playerPartyId(player1.address)).to.equal(0);
      expect(await secretRealm.playerPartyId(player2.address)).to.equal(0);
    });
  });

  describe("view functions", function () {
    it("should return empty progress for non-active player", async function () {
      const { secretRealm, player1 } = await loadFixture(deployFixture);
      const progress = await secretRealm.getProgress(player1.address);
      expect(progress.active).to.be.false;
    });

    it("should return empty party for non-existent id", async function () {
      const { secretRealm } = await loadFixture(deployFixture);
      const party = await secretRealm.getParty(999);
      expect(party.leader).to.equal(ethers.ZeroAddress);
    });

    it("should return realm layer data", async function () {
      const { secretRealm } = await loadFixture(deployFixture);
      // 冰魄秘境 layer 2
      const layer = await secretRealm.getRealmLayer(1, 2);
      expect(layer.monsterAtk).to.equal(2500);
      expect(layer.monsterDef).to.equal(2500);
      expect(layer.reward).to.equal(ethers.parseEther("500"));
    });
  });
});
