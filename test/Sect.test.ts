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
  Sect,
} from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11] =
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

  // Sect
  const SectFactory = await ethers.getContractFactory("Sect");
  const sect = (await SectFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Sect;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(MINTER_ROLE, await sect.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize
  await treasury.setAuthorizedCaller(await sect.getAddress(), true);
  await register.setAuthorizedUpdater(owner.address, true);

  // Register helper
  async function registerPlayer(player: any, origin: number) {
    await register.connect(player).registerIntent(origin, 0, "仙人");
    await mine(1);
    await register.connect(player).finalizeRegistration();
  }

  // Register players with different origins
  const players = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11];
  for (let i = 0; i < players.length; i++) {
    await registerPlayer(players[i], i % 4);
  }

  // Give LS and approve
  const sectAddr = await sect.getAddress();
  for (const p of players) {
    await lingshi.mint(p.address, ethers.parseEther("50000"));
    await lingshi.connect(p).approve(sectAddr, ethers.MaxUint256);
  }

  // Upgrade realm for sect creators (need realm >= 4 = 化神)
  await register.connect(owner).updateRealm(p1.address, 4);
  await register.connect(owner).updateRealm(p2.address, 4);

  return {
    config, lingshi, treasury, register, sect,
    owner, devWallet, foundationWallet,
    p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11,
  };
}

describe("Sect", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { sect, lingshi, treasury, register } = await loadFixture(deployFixture);
      expect(await sect.lingshi()).to.equal(await lingshi.getAddress());
      expect(await sect.treasury()).to.equal(await treasury.getAddress());
      expect(await sect.register()).to.equal(await register.getAddress());
    });

    it("should start with nextSectId = 1", async function () {
      const { sect } = await loadFixture(deployFixture);
      expect(await sect.nextSectId()).to.equal(1);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Sect");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Sect: zero lingshi");
    });
  });

  describe("createSect", function () {
    it("should create sect and set master", async function () {
      const { sect, lingshi, p1 } = await loadFixture(deployFixture);
      const balBefore = await lingshi.balanceOf(p1.address);

      await expect(sect.connect(p1).createSect("天道宗"))
        .to.emit(sect, "SectCreated")
        .withArgs(1, p1.address, "天道宗");

      const balAfter = await lingshi.balanceOf(p1.address);
      expect(balBefore - balAfter).to.equal(ethers.parseEther("1000"));

      const info = await sect.getSectInfo(1);
      expect(info.name).to.equal("天道宗");
      expect(info.master).to.equal(p1.address);
      expect(info.level).to.equal(1);
      expect(info.memberCount).to.equal(1);

      const mem = await sect.getMembership(p1.address);
      expect(mem.sectId).to.equal(1);
      expect(mem.rank).to.equal(3); // Master
    });

    it("should reject if realm too low", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      // p3 is at realm 0
      await expect(
        sect.connect(p3).createSect("weak sect")
      ).to.be.revertedWith("Sect: realm too low");
    });

    it("should reject if already in sect", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await expect(
        sect.connect(p1).createSect("another")
      ).to.be.revertedWith("Sect: already in sect");
    });

    it("should reject empty name", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await expect(
        sect.connect(p1).createSect("")
      ).to.be.revertedWith("Sect: invalid name");
    });

    it("should reject if insufficient LS", async function () {
      const { sect, lingshi, p1, owner } = await loadFixture(deployFixture);
      // Drain p1's LS
      const bal = await lingshi.balanceOf(p1.address);
      await lingshi.connect(p1).transfer(owner.address, bal);
      await expect(
        sect.connect(p1).createSect("天道宗")
      ).to.be.revertedWith("Sect: insufficient LS");
    });
  });

  describe("joinSect", function () {
    it("should join sect", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");

      await expect(sect.connect(p3).joinSect(1))
        .to.emit(sect, "MemberJoined")
        .withArgs(1, p3.address);

      const info = await sect.getSectInfo(1);
      expect(info.memberCount).to.equal(2);

      const mem = await sect.getMembership(p3.address);
      expect(mem.rank).to.equal(0); // Outer
    });

    it("should reject if already in sect", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);
      await expect(
        sect.connect(p3).joinSect(1)
      ).to.be.revertedWith("Sect: already in sect");
    });

    it("should reject if sect not found", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      await expect(
        sect.connect(p3).joinSect(999)
      ).to.be.revertedWith("Sect: not found");
    });
  });

  describe("leaveSect", function () {
    it("should leave sect", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      await expect(sect.connect(p3).leaveSect())
        .to.emit(sect, "MemberLeft")
        .withArgs(1, p3.address);

      const info = await sect.getSectInfo(1);
      expect(info.memberCount).to.equal(1);

      const mem = await sect.getMembership(p3.address);
      expect(mem.sectId).to.equal(0);
    });

    it("should reject if master tries to leave", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await expect(
        sect.connect(p1).leaveSect()
      ).to.be.revertedWith("Sect: master cannot leave");
    });

    it("should reject if not in sect", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      await expect(
        sect.connect(p3).leaveSect()
      ).to.be.revertedWith("Sect: not in sect");
    });
  });

  describe("promoteMember", function () {
    it("should promote member", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      await expect(sect.connect(p1).promoteMember(p3.address, 1)) // Inner
        .to.emit(sect, "MemberPromoted")
        .withArgs(1, p3.address, 1);

      const mem = await sect.getMembership(p3.address);
      expect(mem.rank).to.equal(1); // Inner
    });

    it("should reject non-master", async function () {
      const { sect, p1, p3, p4 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);
      await expect(
        sect.connect(p3).promoteMember(p4.address, 1)
      ).to.be.revertedWith("Sect: not master");
    });

    it("should reject promotion to master", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);
      await expect(
        sect.connect(p1).promoteMember(p3.address, 3) // Master
      ).to.be.revertedWith("Sect: cannot promote to master");
    });
  });

  describe("kickMember", function () {
    it("should kick member", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      await expect(sect.connect(p1).kickMember(p3.address))
        .to.emit(sect, "MemberKicked")
        .withArgs(1, p3.address);

      const mem = await sect.getMembership(p3.address);
      expect(mem.sectId).to.equal(0);
    });

    it("should reject non-master kicking", async function () {
      const { sect, p1, p3, p4 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);
      await expect(
        sect.connect(p3).kickMember(p1.address)
      ).to.be.revertedWith("Sect: not master");
    });

    it("should reject kicking self", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await expect(
        sect.connect(p1).kickMember(p1.address)
      ).to.be.revertedWith("Sect: cannot kick self");
    });
  });

  describe("claimDailyReward", function () {
    it("should claim daily reward", async function () {
      const { sect, lingshi, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      // Advance to next day
      await time.increase(86400);

      const balBefore = await lingshi.balanceOf(p3.address);
      await expect(sect.connect(p3).claimDailyReward())
        .to.emit(sect, "DailyRewardClaimed");

      const balAfter = await lingshi.balanceOf(p3.address);
      // pool = 200 LS, 2 members → 100 LS each
      expect(balAfter - balBefore).to.equal(ethers.parseEther("100"));
    });

    it("should reject if already claimed today", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");

      // Advance to next day and claim
      await time.increase(86400);
      await sect.connect(p1).claimDailyReward();

      await expect(
        sect.connect(p1).claimDailyReward()
      ).to.be.revertedWith("Sect: already claimed today");
    });

    it("should reject if not in sect", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      await expect(
        sect.connect(p3).claimDailyReward()
      ).to.be.revertedWith("Sect: not in sect");
    });
  });

  describe("donateToTreasury", function () {
    it("should donate and earn contribution", async function () {
      const { sect, lingshi, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      const amount = ethers.parseEther("500"); // 500 LS → 50 contribution
      await expect(sect.connect(p3).donateToTreasury(amount))
        .to.emit(sect, "DonationMade")
        .withArgs(1, p3.address, amount, 50);

      const info = await sect.getSectInfo(1);
      expect(info.treasury).to.equal(amount);
      expect(info.totalPoints).to.equal(50);

      const mem = await sect.getMembership(p3.address);
      expect(mem.contribution).to.equal(50);
    });

    it("should cap contribution at 100", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      const amount = ethers.parseEther("5000"); // 5000 LS → 500 contrib → capped at 100
      await sect.connect(p3).donateToTreasury(amount);

      const mem = await sect.getMembership(p3.address);
      expect(mem.contribution).to.equal(100);
    });

    it("should reject zero amount", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await expect(
        sect.connect(p1).donateToTreasury(0)
      ).to.be.revertedWith("Sect: zero amount");
    });
  });

  describe("getCultivationBonus", function () {
    it("should return bonus based on rank and level", async function () {
      const { sect, p1, p3 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p3).joinSect(1);

      // p3 is Outer at level 1 sect → 1000 BP (10%)
      const bonus = await sect.getCultivationBonus(p3.address);
      expect(bonus).to.equal(1000);

      // Promote to Inner → 1200 BP (12%)
      await sect.connect(p1).promoteMember(p3.address, 1);
      const bonusInner = await sect.getCultivationBonus(p3.address);
      expect(bonusInner).to.equal(1200);

      // Promote to Elder → 1500 BP (15%)
      await sect.connect(p1).promoteMember(p3.address, 2);
      const bonusElder = await sect.getCultivationBonus(p3.address);
      expect(bonusElder).to.equal(1500);
    });

    it("should return 0 for non-member", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      expect(await sect.getCultivationBonus(p3.address)).to.equal(0);
    });

    it("should use Elder bonus for Master rank", async function () {
      const { sect, p1 } = await loadFixture(deployFixture);
      await sect.connect(p1).createSect("天道宗");
      // Master uses Elder bonus: 1500 for level 1
      const bonus = await sect.getCultivationBonus(p1.address);
      expect(bonus).to.equal(1500);
    });
  });

  describe("Sect War", function () {
    async function warFixture() {
      const base = await loadFixture(deployFixture);
      const { sect, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11 } = base;

      // Create two sects
      await sect.connect(p1).createSect("天道宗");
      await sect.connect(p2).createSect("魔道宗");

      // Add members to both sects
      await sect.connect(p3).joinSect(1);
      await sect.connect(p4).joinSect(1);
      await sect.connect(p5).joinSect(1);
      await sect.connect(p6).joinSect(1);

      await sect.connect(p7).joinSect(2);
      await sect.connect(p8).joinSect(2);
      await sect.connect(p9).joinSect(2);
      await sect.connect(p10).joinSect(2);

      // Donate to build treasury
      const donateAmount = ethers.parseEther("5000");
      await sect.connect(p1).donateToTreasury(donateAmount);
      await sect.connect(p2).donateToTreasury(donateAmount);

      return base;
    }

    it("should initiate sect war", async function () {
      const { sect, p1 } = await warFixture();
      const wager = ethers.parseEther("100");

      await expect(sect.connect(p1).challengeSect(2, wager))
        .to.emit(sect, "SectWarInitiated")
        .withArgs(1, 1, 2, wager);

      const war = await sect.getWar(1);
      expect(war.attackerSectId).to.equal(1);
      expect(war.defenderSectId).to.equal(2);
      expect(war.wager).to.equal(wager);
      expect(war.status).to.equal(0); // Pending

      // Treasury should be reduced
      const info = await sect.getSectInfo(1);
      expect(info.treasury).to.equal(ethers.parseEther("5000") - wager);
    });

    it("should reject if not master", async function () {
      const { sect, p3 } = await warFixture();
      await expect(
        sect.connect(p3).challengeSect(2, ethers.parseEther("100"))
      ).to.be.revertedWith("Sect: not master");
    });

    it("should reject if wager too low", async function () {
      const { sect, p1 } = await warFixture();
      await expect(
        sect.connect(p1).challengeSect(2, ethers.parseEther("10"))
      ).to.be.revertedWith("Sect: wager too low");
    });

    it("should reject challenge self", async function () {
      const { sect, p1 } = await warFixture();
      await expect(
        sect.connect(p1).challengeSect(1, ethers.parseEther("100"))
      ).to.be.revertedWith("Sect: cannot challenge self");
    });

    it("should accept sect war", async function () {
      const { sect, p1, p2 } = await warFixture();
      const wager = ethers.parseEther("100");
      await sect.connect(p1).challengeSect(2, wager);

      await expect(sect.connect(p2).acceptSectWar(1))
        .to.emit(sect, "SectWarAccepted")
        .withArgs(1);

      const war = await sect.getWar(1);
      expect(war.status).to.equal(2); // CommitPhase
    });

    it("should reject sect war", async function () {
      const { sect, p1, p2 } = await warFixture();
      const wager = ethers.parseEther("100");
      await sect.connect(p1).challengeSect(2, wager);

      await expect(sect.connect(p2).rejectSectWar(1))
        .to.emit(sect, "SectWarRejected")
        .withArgs(1);

      const war = await sect.getWar(1);
      expect(war.status).to.equal(5); // Rejected

      // Attacker gets wager back + 20% penalty
      const penalty = wager * 2000n / 10000n; // 20 LS
      const info1 = await sect.getSectInfo(1);
      // Originally 5000 - 100 (wager), now + 100 (refund) + 20 (penalty) = 5020
      expect(info1.treasury).to.equal(ethers.parseEther("5000") + penalty);
    });

    it("should complete full war flow (commit-reveal-settle)", async function () {
      const { sect, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10 } = await warFixture();
      const wager = ethers.parseEther("200");

      // Challenge + accept
      await sect.connect(p1).challengeSect(2, wager);
      await sect.connect(p2).acceptSectWar(1);

      // Commit phase
      const attackerFighters: [string, string, string, string, string] = [
        p1.address, p3.address, p4.address, p5.address, p6.address,
      ];
      const defenderFighters: [string, string, string, string, string] = [
        p2.address, p7.address, p8.address, p9.address, p10.address,
      ];

      const attackerSalt = ethers.keccak256(ethers.toUtf8Bytes("attacker_secret"));
      const defenderSalt = ethers.keccak256(ethers.toUtf8Bytes("defender_secret"));

      const attackerHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "address", "address", "address", "address", "bytes32"],
          [...attackerFighters, attackerSalt]
        )
      );
      const defenderHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "address", "address", "address", "address", "bytes32"],
          [...defenderFighters, defenderSalt]
        )
      );

      await sect.connect(p1).commitFighterOrder(1, attackerHash);
      await sect.connect(p2).commitFighterOrder(1, defenderHash);

      // Should now be in RevealPhase
      let war = await sect.getWar(1);
      expect(war.status).to.equal(3); // RevealPhase

      // Reveal
      await sect.connect(p1).revealFighterOrder(1, attackerFighters, attackerSalt);
      await sect.connect(p2).revealFighterOrder(1, defenderFighters, defenderSalt);

      // Should be settled
      war = await sect.getWar(1);
      expect(war.status).to.equal(4); // Settled
      // Winner should be one of the two sects or 0 (draw)
      expect(war.winnerSectId).to.be.gte(0);
    });

    it("should reject commit if not in commit phase", async function () {
      const { sect, p1 } = await warFixture();
      await sect.connect(p1).challengeSect(2, ethers.parseEther("100"));

      // War is Pending, not CommitPhase
      await expect(
        sect.connect(p1).commitFighterOrder(1, ethers.ZeroHash)
      ).to.be.revertedWith("Sect: not commit phase");
    });

    it("should reject reveal with wrong hash", async function () {
      const { sect, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10 } = await warFixture();
      await sect.connect(p1).challengeSect(2, ethers.parseEther("100"));
      await sect.connect(p2).acceptSectWar(1);

      const fighters: [string, string, string, string, string] = [
        p1.address, p3.address, p4.address, p5.address, p6.address,
      ];
      const salt = ethers.keccak256(ethers.toUtf8Bytes("secret"));
      const hash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "address", "address", "address", "address", "bytes32"],
          [...fighters, salt]
        )
      );

      // Commit both
      await sect.connect(p1).commitFighterOrder(1, hash);
      const defenderFighters: [string, string, string, string, string] = [
        p2.address, p7.address, p8.address, p9.address, p10.address,
      ];
      const defSalt = ethers.keccak256(ethers.toUtf8Bytes("defsecret"));
      const defHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "address", "address", "address", "address", "bytes32"],
          [...defenderFighters, defSalt]
        )
      );
      await sect.connect(p2).commitFighterOrder(1, defHash);

      // Reveal with wrong salt
      const wrongSalt = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      await expect(
        sect.connect(p1).revealFighterOrder(1, fighters, wrongSalt)
      ).to.be.revertedWith("Sect: hash mismatch");
    });

    it("should reject accept if challenge expired", async function () {
      const { sect, p1, p2 } = await warFixture();
      await sect.connect(p1).challengeSect(2, ethers.parseEther("100"));

      // Advance past 24 hours
      await time.increase(24 * 3600 + 1);

      await expect(
        sect.connect(p2).acceptSectWar(1)
      ).to.be.revertedWith("Sect: challenge expired");
    });

    it("should reject commit if already committed", async function () {
      const { sect, p1, p2 } = await warFixture();
      await sect.connect(p1).challengeSect(2, ethers.parseEther("100"));
      await sect.connect(p2).acceptSectWar(1);

      const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      await sect.connect(p1).commitFighterOrder(1, hash);

      await expect(
        sect.connect(p1).commitFighterOrder(1, hash)
      ).to.be.revertedWith("Sect: already committed");
    });

    it("should reject insufficient treasury for war wager", async function () {
      const { sect, p1 } = await warFixture();
      // Try to wager more than treasury has
      await expect(
        sect.connect(p1).challengeSect(2, ethers.parseEther("99999"))
      ).to.be.revertedWith("Sect: insufficient treasury");
    });
  });

  describe("view functions", function () {
    it("should return empty sect for non-existent id", async function () {
      const { sect } = await loadFixture(deployFixture);
      const info = await sect.getSectInfo(999);
      expect(info.master).to.equal(ethers.ZeroAddress);
    });

    it("should return empty membership for non-member", async function () {
      const { sect, p3 } = await loadFixture(deployFixture);
      const mem = await sect.getMembership(p3.address);
      expect(mem.sectId).to.equal(0);
    });

    it("should return empty war for non-existent id", async function () {
      const { sect } = await loadFixture(deployFixture);
      const war = await sect.getWar(999);
      expect(war.attackerSectId).to.equal(0);
    });
  });
});
