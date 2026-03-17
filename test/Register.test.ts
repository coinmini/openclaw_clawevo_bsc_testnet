import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";
import { LingShi, Register, GameConfig } from "../typechain-types";

async function deployFixture() {
  const [owner, player1, player2, player3] = await ethers.getSigners();

  // Deploy GameConfig
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await upgrades.deployProxy(ConfigFactory, [owner.address], {
    kind: "uups",
  });
  const config = configProxy as unknown as GameConfig;

  // Deploy LingShi
  const LingShiFactory = await ethers.getContractFactory("LingShi");
  const lingshi = (await LingShiFactory.deploy(owner.address)) as LingShi;

  // Deploy Register
  const RegisterFactory = await ethers.getContractFactory("Register");
  const register = (await RegisterFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress()
  )) as Register;

  // Grant MINTER_ROLE to Register
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  await lingshi.connect(owner).grantRole(MINTER_ROLE, await register.getAddress());

  // Helper: faction value (0-3)
  const faction = 0;

  return { config, lingshi, register, owner, player1, player2, player3, faction };
}

describe("Register", function () {
  describe("Deployment", function () {
    it("should set correct lingshi and config addresses", async function () {
      const { register, lingshi, config } = await loadFixture(deployFixture);
      expect(await register.lingshi()).to.equal(await lingshi.getAddress());
      expect(await register.gameConfig()).to.equal(await config.getAddress());
    });

    it("should revert with zero lingshi address", async function () {
      const Factory = await ethers.getContractFactory("Register");
      const [owner] = await ethers.getSigners();
      const ConfigFactory = await ethers.getContractFactory("GameConfig");
      const cfg = await upgrades.deployProxy(ConfigFactory, [owner.address], {
        kind: "uups",
      });
      await expect(
        Factory.deploy(ethers.ZeroAddress, await cfg.getAddress())
      ).to.be.revertedWith("Register: zero lingshi");
    });
  });

  describe("registerIntent", function () {
    it("should create an intent with correct data", async function () {
      const { register, player1 } = await loadFixture(deployFixture);

      const tx = await register.connect(player1).registerIntent(0, 1, "测试角色");
      const receipt = await tx.wait();
      const block = receipt!.blockNumber;

      const intent = await register.getIntent(player1.address);
      expect(intent.origin).to.equal(0);
      expect(intent.faction).to.equal(1);
      expect(intent.blockNumber).to.equal(block);
      expect(intent.finalized).to.be.false;
    });

    it("should emit RegisterIntentCreated event", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(register.connect(player1).registerIntent(0, 0, "草莽一号"))
        .to.emit(register, "RegisterIntentCreated");
    });

    it("should reject invalid origin (>= 4)", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(
        register.connect(player1).registerIntent(4, 0, "无效出身")
      ).to.be.revertedWith("Register: invalid origin");
    });

    it("should reject invalid faction (>= 4)", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(
        register.connect(player1).registerIntent(0, 4, "无效流派")
      ).to.be.revertedWith("Register: invalid faction");
    });

    it("should reject if intent already exists", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await expect(
        register.connect(player1).registerIntent(1, 0, "游商一号")
      ).to.be.revertedWith("Register: intent exists");
    });

    it("should accept all valid origins (0-3)", async function () {
      const { register, player1, player2, player3 } =
        await loadFixture(deployFixture);
      const [, , , , p4] = await ethers.getSigners();

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await register.connect(player2).registerIntent(1, 1, "游商二号");
      await register.connect(player3).registerIntent(2, 2, "苦力三号");
      await register.connect(p4).registerIntent(3, 3, "书生四号");

      expect((await register.getIntent(player1.address)).origin).to.equal(0);
      expect((await register.getIntent(player2.address)).origin).to.equal(1);
      expect((await register.getIntent(player3.address)).origin).to.equal(2);
      expect((await register.getIntent(p4.address)).origin).to.equal(3);
    });
  });

  describe("finalizeRegistration", function () {
    it("should complete registration after 1 block", async function () {
      const { register, lingshi, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1); // advance 1 block

      await register.connect(player1).finalizeRegistration();

      expect(await register.isRegistered(player1.address)).to.be.true;
      // Should receive 20 LS
      expect(await lingshi.balanceOf(player1.address)).to.equal(
        ethers.parseEther("20")
      );
    });

    it("should emit CultivatorRegistered event", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);

      await expect(register.connect(player1).finalizeRegistration())
        .to.emit(register, "CultivatorRegistered");
    });

    it("should set correct initial attributes for origin 0 (草莽)", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      // 草莽: attack = 100 * 11500 / 10000 = 115
      // defense = 100 * 10500 / 10000 = 105
      // perception = 100, wisdom = 100
      expect(c.attack).to.equal(115);
      expect(c.defense).to.equal(105);
      expect(c.perception).to.equal(100);
      expect(c.wisdom).to.equal(100);
      expect(c.realm).to.equal(0);
      expect(c.subRealm).to.equal(0);
      expect(c.heart).to.equal(0);
      expect(c.fortune).to.equal(0);
    });

    it("should set correct initial attributes for origin 1 (游商)", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(1, 0, "游商一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.attack).to.equal(100);
      expect(c.defense).to.equal(100);
      expect(c.perception).to.equal(115);
      expect(c.wisdom).to.equal(100);
    });

    it("should set correct initial attributes for origin 2 (苦力)", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(2, 0, "苦力一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.attack).to.equal(100);
      expect(c.defense).to.equal(115);
      expect(c.perception).to.equal(100);
      expect(c.wisdom).to.equal(100);
    });

    it("should set correct initial attributes for origin 3 (书生)", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(3, 0, "书生一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.attack).to.equal(100);
      expect(c.defense).to.equal(100);
      expect(c.perception).to.equal(100);
      expect(c.wisdom).to.equal(115);
    });

    it("should assign element in range [0, 4]", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.element).to.be.lessThan(5);
    });

    it("should reject finalize without intent", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(
        register.connect(player1).finalizeRegistration()
      ).to.be.revertedWith("Register: no intent");
    });

    it("should succeed when finalize is in the next block (Hardhat auto-mines)", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      // In Hardhat, each tx auto-mines a new block, so finalize is always >= intent+1
      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await register.connect(player1).finalizeRegistration();
      expect(await register.isRegistered(player1.address)).to.be.true;
    });

    it("should reject finalize after window expired", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(257); // exceed 256 block window

      await expect(
        register.connect(player1).finalizeRegistration()
      ).to.be.revertedWith("Register: window expired");
    });

    it("should reject double finalize", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      await expect(
        register.connect(player1).finalizeRegistration()
      ).to.be.revertedWith("Register: already finalized");
    });

    it("should reject re-registration after already registered", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      // Try to register again
      await expect(
        register.connect(player1).registerIntent(1, 0, "游商一号")
      ).to.be.revertedWith("Register: already registered");
    });

    it("should store faction correctly", async function () {
      const { register, player1 } =
        await loadFixture(deployFixture);

      await register.connect(player1).registerIntent(0, 2, "阵修角色");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.faction).to.equal(2);
    });
  });

  describe("getCultivator", function () {
    it("should revert for unregistered player", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(register.getCultivator(player1.address)).to.be.revertedWith(
        "Register: not registered"
      );
    });
  });

  describe("Name", function () {
    it("should store name from registration", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await register.connect(player1).registerIntent(0, 0, "云中子");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      const c = await register.getCultivator(player1.address);
      expect(c.name).to.equal("云中子");
    });

    it("should allow setName to change name", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await register.connect(player1).registerIntent(0, 0, "旧名");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      await register.connect(player1).setName("新名");
      const c = await register.getCultivator(player1.address);
      expect(c.name).to.equal("新名");
    });

    it("should emit NameSet event", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await register.connect(player1).registerIntent(0, 0, "角色");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      await expect(register.connect(player1).setName("新角色"))
        .to.emit(register, "NameSet")
        .withArgs(player1.address, "新角色");
    });

    it("should reject empty name on register", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(
        register.connect(player1).registerIntent(0, 0, "")
      ).to.be.revertedWith("Register: name 1-16 bytes");
    });

    it("should reject name > 16 bytes on setName", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await register.connect(player1).registerIntent(0, 0, "角色");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      await expect(
        register.connect(player1).setName("12345678901234567")
      ).to.be.revertedWith("Register: name 1-16 bytes");
    });

    it("should reject setName from unregistered player", async function () {
      const { register, player1 } = await loadFixture(deployFixture);
      await expect(
        register.connect(player1).setName("名字")
      ).to.be.revertedWith("Register: not registered");
    });
  });

  describe("Multiple Players", function () {
    it("should register multiple players independently", async function () {
      const { register, lingshi, player1, player2 } =
        await loadFixture(deployFixture);

      // Player1 registers as 草莽
      await register.connect(player1).registerIntent(0, 0, "草莽一号");
      await mine(1);
      await register.connect(player1).finalizeRegistration();

      // Player2 registers as 书生
      await register.connect(player2).registerIntent(3, 1, "书生体修");
      await mine(1);
      await register.connect(player2).finalizeRegistration();

      expect(await register.isRegistered(player1.address)).to.be.true;
      expect(await register.isRegistered(player2.address)).to.be.true;

      const c1 = await register.getCultivator(player1.address);
      const c2 = await register.getCultivator(player2.address);

      expect(c1.origin).to.equal(0);
      expect(c2.origin).to.equal(3);

      // Both get 20 LS
      expect(await lingshi.balanceOf(player1.address)).to.equal(
        ethers.parseEther("20")
      );
      expect(await lingshi.balanceOf(player2.address)).to.equal(
        ethers.parseEther("20")
      );
    });
  });
});
