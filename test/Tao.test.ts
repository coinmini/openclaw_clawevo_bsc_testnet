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
  Tao,
} from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, player1, player2, player3, player4] =
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

  // Tao
  const TaoFactory = await ethers.getContractFactory("Tao");
  const tao = (await TaoFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Tao;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize tao to call treasury
  await treasury.setAuthorizedCaller(await tao.getAddress(), true);

  // Allow Register to be updated (for realm testing)
  await register.setAuthorizedUpdater(owner.address, true);

  // Register players
  async function registerPlayer(player: any, idx: number) {
    await register.connect(player).registerIntent(idx % 4, 0, "仙人");
    await mine(1);
    await register.connect(player).finalizeRegistration();
  }

  await registerPlayer(player1, 1);
  await registerPlayer(player2, 2);
  await registerPlayer(player3, 3);

  // Give players LS
  await lingshi.mint(player1.address, ethers.parseEther("1000"));
  await lingshi.mint(player2.address, ethers.parseEther("1000"));
  await lingshi.mint(player3.address, ethers.parseEther("1000"));

  // Approve tao for LS
  const taoAddr = await tao.getAddress();
  await lingshi.connect(player1).approve(taoAddr, ethers.MaxUint256);
  await lingshi.connect(player2).approve(taoAddr, ethers.MaxUint256);
  await lingshi.connect(player3).approve(taoAddr, ethers.MaxUint256);

  return {
    config, lingshi, treasury, register, tao,
    owner, devWallet, foundationWallet,
    player1, player2, player3, player4,
  };
}

describe("Tao", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { tao, lingshi, treasury, register } = await loadFixture(deployFixture);
      expect(await tao.lingshi()).to.equal(await lingshi.getAddress());
      expect(await tao.treasury()).to.equal(await treasury.getAddress());
      expect(await tao.register()).to.equal(await register.getAddress());
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Tao");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Tao: zero lingshi");
    });
  });

  describe("proposePartnership", function () {
    it("should create proposal", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await expect(tao.connect(player1).proposePartnership(player2.address))
        .to.emit(tao, "PartnershipProposed")
        .withArgs(player1.address, player2.address);

      const prop = await tao.proposals(player1.address);
      expect(prop.target).to.equal(player2.address);
      expect(prop.active).to.be.true;
    });

    it("should reject unregistered proposer", async function () {
      const { tao, player4, player1 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player4).proposePartnership(player1.address)
      ).to.be.revertedWith("Tao: proposer not registered");
    });

    it("should reject unregistered target", async function () {
      const { tao, player1, player4 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player1).proposePartnership(player4.address)
      ).to.be.revertedWith("Tao: target not registered");
    });

    it("should reject self-proposal", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player1).proposePartnership(player1.address)
      ).to.be.revertedWith("Tao: cannot propose self");
    });

    it("should reject if proposer already has partner", async function () {
      const { tao, player1, player2, player3 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      await expect(
        tao.connect(player1).proposePartnership(player3.address)
      ).to.be.revertedWith("Tao: already has partner");
    });

    it("should reject if target already has partner", async function () {
      const { tao, player1, player2, player3 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      await expect(
        tao.connect(player3).proposePartnership(player2.address)
      ).to.be.revertedWith("Tao: target has partner");
    });

    it("should reject duplicate proposal", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await expect(
        tao.connect(player1).proposePartnership(player2.address)
      ).to.be.revertedWith("Tao: proposal pending");
    });

    it("should reject if realm diff > 2", async function () {
      const { tao, register, player1, player2 } = await loadFixture(deployFixture);

      // Set player1 to 化神(4), player2 stays at 练气(0) → diff=4
      await register.updateRealm(player1.address, 4);

      await expect(
        tao.connect(player1).proposePartnership(player2.address)
      ).to.be.revertedWith("Tao: realm diff too large");
    });

    it("should allow realm diff = 2", async function () {
      const { tao, register, player1, player2 } = await loadFixture(deployFixture);

      // Set player1 to 金丹(2), player2 stays at 练气(0) → diff=2
      await register.updateRealm(player1.address, 2);

      await expect(
        tao.connect(player1).proposePartnership(player2.address)
      ).to.not.be.reverted;
    });
  });

  describe("acceptPartnership", function () {
    it("should form partnership and deduct fees", async function () {
      const { tao, lingshi, player1, player2 } = await loadFixture(deployFixture);

      const bal1Before = await lingshi.balanceOf(player1.address);
      const bal2Before = await lingshi.balanceOf(player2.address);

      await tao.connect(player1).proposePartnership(player2.address);
      await expect(tao.connect(player2).acceptPartnership(player1.address))
        .to.emit(tao, "PartnershipFormed")
        .withArgs(player1.address, player2.address);

      const bal1After = await lingshi.balanceOf(player1.address);
      const bal2After = await lingshi.balanceOf(player2.address);

      const fee = ethers.parseEther("50");
      expect(bal1Before - bal1After).to.equal(fee);
      expect(bal2Before - bal2After).to.equal(fee);

      // Check partnership
      expect(await tao.getPartner(player1.address)).to.equal(player2.address);
      expect(await tao.getPartner(player2.address)).to.equal(player1.address);
    });

    it("should reject if no active proposal", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player2).acceptPartnership(player1.address)
      ).to.be.revertedWith("Tao: no active proposal");
    });

    it("should reject if not target", async function () {
      const { tao, player1, player2, player3 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await expect(
        tao.connect(player3).acceptPartnership(player1.address)
      ).to.be.revertedWith("Tao: not target");
    });

    it("should reject if proposer has insufficient LS", async function () {
      const { tao, lingshi, player1, player2, owner } = await loadFixture(deployFixture);

      // Drain player1's LS
      const bal = await lingshi.balanceOf(player1.address);
      await lingshi.connect(player1).transfer(owner.address, bal);

      await tao.connect(player1).proposePartnership(player2.address);
      await expect(
        tao.connect(player2).acceptPartnership(player1.address)
      ).to.be.revertedWith("Tao: proposer insufficient LS");
    });
  });

  describe("cancelProposal", function () {
    it("should cancel active proposal", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await expect(tao.connect(player1).cancelProposal())
        .to.emit(tao, "ProposalCancelled")
        .withArgs(player1.address, player2.address);

      const prop = await tao.proposals(player1.address);
      expect(prop.active).to.be.false;
    });

    it("should reject if no active proposal", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player1).cancelProposal()
      ).to.be.revertedWith("Tao: no active proposal");
    });
  });

  describe("dissolvePartnership", function () {
    it("should dissolve and charge fee", async function () {
      const { tao, lingshi, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      const balBefore = await lingshi.balanceOf(player1.address);
      await expect(tao.connect(player1).dissolvePartnership())
        .to.emit(tao, "PartnershipDissolved");

      const balAfter = await lingshi.balanceOf(player1.address);
      expect(balBefore - balAfter).to.equal(ethers.parseEther("20"));

      // Partners cleared
      expect(await tao.getPartner(player1.address)).to.equal(ethers.ZeroAddress);
      expect(await tao.getPartner(player2.address)).to.equal(ethers.ZeroAddress);
    });

    it("should set cooldown for both parties", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      // Initiator: 72h cooldown
      const [inCd1, cdEnd1] = await tao.isInCooldown(player1.address);
      expect(inCd1).to.be.true;

      // Recipient: 48h cooldown
      const [inCd2, cdEnd2] = await tao.isInCooldown(player2.address);
      expect(inCd2).to.be.true;

      // Initiator cooldown should be longer
      expect(cdEnd1).to.be.gt(cdEnd2);
    });

    it("should charge min(20, balance) when low balance", async function () {
      const { tao, lingshi, player1, player2, owner } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      // Drain most of player1's LS, leave only 5
      const bal = await lingshi.balanceOf(player1.address);
      const toKeep = ethers.parseEther("5");
      await lingshi.connect(player1).transfer(owner.address, bal - toKeep);

      const balBefore = await lingshi.balanceOf(player1.address);
      await tao.connect(player1).dissolvePartnership();
      const balAfter = await lingshi.balanceOf(player1.address);

      // Should charge only 5 LS (all remaining)
      expect(balBefore - balAfter).to.equal(toKeep);
    });

    it("should charge 0 when balance is 0", async function () {
      const { tao, lingshi, player1, player2, owner } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      // Drain all LS
      const bal = await lingshi.balanceOf(player1.address);
      await lingshi.connect(player1).transfer(owner.address, bal);

      await expect(tao.connect(player1).dissolvePartnership()).to.not.be.reverted;
    });

    it("should reject if no partner", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);
      await expect(
        tao.connect(player1).dissolvePartnership()
      ).to.be.revertedWith("Tao: no partner");
    });

    it("should prevent new partnership during cooldown", async function () {
      const { tao, player1, player2, player3 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      // player1 (initiator) should be in 72h cooldown
      await expect(
        tao.connect(player1).proposePartnership(player3.address)
      ).to.be.revertedWith("Tao: proposer in cooldown");

      // player2 (recipient) should also be in cooldown
      await expect(
        tao.connect(player3).proposePartnership(player2.address)
      ).to.be.revertedWith("Tao: target in cooldown");
    });

    it("should allow new partnership after cooldown expires", async function () {
      const { tao, player1, player2, player3 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      // Advance past 72h
      await time.increase(72 * 3600 + 1);

      await expect(
        tao.connect(player1).proposePartnership(player3.address)
      ).to.not.be.reverted;
    });
  });

  describe("getCultivationBonus", function () {
    it("should return 300 BP when has partner", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      const [heart, luck] = await tao.getCultivationBonus(player1.address);
      expect(heart).to.equal(300);
      expect(luck).to.equal(300);
    });

    it("should return 0 when no partner", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);

      const [heart, luck] = await tao.getCultivationBonus(player1.address);
      expect(heart).to.equal(0);
      expect(luck).to.equal(0);
    });

    it("should return 0 after dissolution", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      const [heart, luck] = await tao.getCultivationBonus(player1.address);
      expect(heart).to.equal(0);
      expect(luck).to.equal(0);
    });
  });

  describe("getPartnership", function () {
    it("should return partnership details", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);

      const p1 = await tao.getPartnership(player1.address);
      expect(p1.partnerA).to.not.equal(ethers.ZeroAddress);
      expect(p1.partnerB).to.not.equal(ethers.ZeroAddress);
      expect(p1.since).to.be.gt(0);
      expect(p1.dualCultCount).to.equal(0);
      expect(p1.huntCount).to.equal(0);

      // Both sides should see the same partnership
      const p2 = await tao.getPartnership(player2.address);
      expect(p2.since).to.equal(p1.since);
    });

    it("should return empty for no partner", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);

      const p = await tao.getPartnership(player1.address);
      expect(p.partnerA).to.equal(ethers.ZeroAddress);
      expect(p.since).to.equal(0);
    });
  });

  describe("isInCooldown", function () {
    it("should return false when no cooldown", async function () {
      const { tao, player1 } = await loadFixture(deployFixture);

      const [inCd, cdEnd] = await tao.isInCooldown(player1.address);
      expect(inCd).to.be.false;
      expect(cdEnd).to.equal(0);
    });

    it("should return true during cooldown", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      const [inCd, cdEnd] = await tao.isInCooldown(player1.address);
      expect(inCd).to.be.true;
      expect(cdEnd).to.be.gt(0);
    });

    it("should return false after cooldown expires", async function () {
      const { tao, player1, player2 } = await loadFixture(deployFixture);

      await tao.connect(player1).proposePartnership(player2.address);
      await tao.connect(player2).acceptPartnership(player1.address);
      await tao.connect(player1).dissolvePartnership();

      await time.increase(72 * 3600 + 1);

      const [inCd] = await tao.isInCooldown(player1.address);
      expect(inCd).to.be.false;
    });
  });
});
