import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { LingShi, Register, GameConfig } from "../../typechain-types";

async function deployFullStackFixture() {
  const [owner, player1, player2, player3] = await ethers.getSigners();

  // GameConfig
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await upgrades.deployProxy(ConfigFactory, [owner.address], {
    kind: "uups",
  });
  const config = configProxy as unknown as GameConfig;

  // LingShi
  const LingShiFactory = await ethers.getContractFactory("LingShi");
  const lingshi = (await LingShiFactory.deploy(owner.address)) as LingShi;

  // Register
  const RegisterFactory = await ethers.getContractFactory("Register");
  const register = (await RegisterFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress()
  )) as Register;

  // Grant MINTER_ROLE to Register
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  await lingshi.connect(owner).grantRole(MINTER_ROLE, await register.getAddress());

  return { config, lingshi, register, owner, player1, player2, player3 };
}

describe("Integration: Registration Flow", function () {
  it("should complete full registration: intent → finalize → receive LS", async function () {
    const { lingshi, register, player1 } =
      await loadFixture(deployFullStackFixture);

    const faction = 2; // 阵营

    // Verify initial state
    expect(await register.isRegistered(player1.address)).to.be.false;
    expect(await lingshi.balanceOf(player1.address)).to.equal(0);
    expect(await lingshi.totalSupply()).to.equal(0);

    // TX1: registerIntent
    await register.connect(player1).registerIntent(0, faction, "仙人");
    await mine(1);

    // TX2: finalizeRegistration
    await register.connect(player1).finalizeRegistration();

    // Verify final state
    expect(await register.isRegistered(player1.address)).to.be.true;
    expect(await lingshi.balanceOf(player1.address)).to.equal(
      ethers.parseEther("20")
    );
    expect(await lingshi.totalSupply()).to.equal(ethers.parseEther("20"));

    const c = await register.getCultivator(player1.address);
    expect(c.realm).to.equal(0); // 练气
    expect(c.subRealm).to.equal(0); // 1重
    expect(c.element).to.be.lessThan(5);
    expect(c.registeredAt).to.be.greaterThan(0);
  });

  it("should handle 3 players registering with different origins", async function () {
    const { lingshi, register, player1, player2, player3 } =
      await loadFixture(deployFullStackFixture);

    const origins = [0, 1, 2]; // 草莽, 游商, 苦力
    const players = [player1, player2, player3];

    for (let i = 0; i < 3; i++) {
      const faction = i; // 0, 1, 2

      await register.connect(players[i]).registerIntent(origins[i], faction, "仙人");
      await mine(1);
      await register.connect(players[i]).finalizeRegistration();
    }

    // All registered
    for (const p of players) {
      expect(await register.isRegistered(p.address)).to.be.true;
      expect(await lingshi.balanceOf(p.address)).to.equal(ethers.parseEther("20"));
    }

    // Total supply = 3 * 20 = 60 LS
    expect(await lingshi.totalSupply()).to.equal(ethers.parseEther("60"));

    // Verify different attributes
    const c0 = await register.getCultivator(player1.address);
    const c1 = await register.getCultivator(player2.address);
    const c2 = await register.getCultivator(player3.address);

    // 草莽: atk=115, def=105
    expect(c0.attack).to.equal(115);
    expect(c0.defense).to.equal(105);

    // 游商: perception=115
    expect(c1.perception).to.equal(115);
    expect(c1.attack).to.equal(100);

    // 苦力: def=115
    expect(c2.defense).to.equal(115);
    expect(c2.attack).to.equal(100);
  });

  it("should respect modified initialLingShi from GameConfig", async function () {
    const { config, lingshi, register, owner, player1 } =
      await loadFixture(deployFullStackFixture);

    // Owner changes initial LS to 50
    await config.connect(owner).setInitialLingShi(ethers.parseEther("50"));

    const faction = 1;

    await register.connect(player1).registerIntent(0, faction, "仙人");
    await mine(1);
    await register.connect(player1).finalizeRegistration();

    expect(await lingshi.balanceOf(player1.address)).to.equal(
      ethers.parseEther("50")
    );
  });
});
