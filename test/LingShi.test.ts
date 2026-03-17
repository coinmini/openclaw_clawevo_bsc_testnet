import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { LingShi } from "../typechain-types";

async function deployFixture() {
  const [admin, minter, burner, user1, user2] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("LingShi");
  const lingshi = (await Factory.deploy(admin.address)) as LingShi;

  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();

  await lingshi.connect(admin).grantRole(MINTER_ROLE, minter.address);
  await lingshi.connect(admin).grantRole(BURNER_ROLE, burner.address);

  return { lingshi, admin, minter, burner, user1, user2, MINTER_ROLE, BURNER_ROLE };
}

describe("LingShi", function () {
  describe("Deployment", function () {
    it("should have name LingShi and symbol LS", async function () {
      const { lingshi } = await loadFixture(deployFixture);
      expect(await lingshi.name()).to.equal("LingShi");
      expect(await lingshi.symbol()).to.equal("LS");
    });

    it("should start with zero total supply", async function () {
      const { lingshi } = await loadFixture(deployFixture);
      expect(await lingshi.totalSupply()).to.equal(0);
    });

    it("should revert deployment with zero admin", async function () {
      const Factory = await ethers.getContractFactory("LingShi");
      await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "LingShi: zero address"
      );
    });

    it("should grant DEFAULT_ADMIN_ROLE to admin", async function () {
      const { lingshi, admin } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN = await lingshi.DEFAULT_ADMIN_ROLE();
      expect(await lingshi.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("should allow MINTER_ROLE to mint", async function () {
      const { lingshi, minter, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await lingshi.connect(minter).mint(user1.address, amount);
      expect(await lingshi.balanceOf(user1.address)).to.equal(amount);
      expect(await lingshi.totalSupply()).to.equal(amount);
    });

    it("should reject mint from non-MINTER_ROLE", async function () {
      const { lingshi, user1, MINTER_ROLE } = await loadFixture(deployFixture);
      await expect(
        lingshi.connect(user1).mint(user1.address, 100)
      ).to.be.revertedWithCustomError(lingshi, "AccessControlUnauthorizedAccount")
        .withArgs(user1.address, MINTER_ROLE);
    });

    it("should reject mint to zero address", async function () {
      const { lingshi, minter } = await loadFixture(deployFixture);
      await expect(
        lingshi.connect(minter).mint(ethers.ZeroAddress, 100)
      ).to.be.revertedWith("LingShi: mint to zero");
    });

    it("should reject mint of zero amount", async function () {
      const { lingshi, minter, user1 } = await loadFixture(deployFixture);
      await expect(
        lingshi.connect(minter).mint(user1.address, 0)
      ).to.be.revertedWith("LingShi: zero amount");
    });
  });

  describe("Burning", function () {
    it("should allow BURNER_ROLE to burn", async function () {
      const { lingshi, minter, burner, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await lingshi.connect(minter).mint(user1.address, amount);

      const burnAmount = ethers.parseEther("40");
      await lingshi.connect(burner).burn(user1.address, burnAmount);

      expect(await lingshi.balanceOf(user1.address)).to.equal(
        ethers.parseEther("60")
      );
      expect(await lingshi.totalSupply()).to.equal(ethers.parseEther("60"));
    });

    it("should reject burn from non-BURNER_ROLE", async function () {
      const { lingshi, minter, user1, BURNER_ROLE } = await loadFixture(deployFixture);
      await lingshi.connect(minter).mint(user1.address, 100);
      await expect(
        lingshi.connect(user1).burn(user1.address, 50)
      ).to.be.revertedWithCustomError(lingshi, "AccessControlUnauthorizedAccount")
        .withArgs(user1.address, BURNER_ROLE);
    });

    it("should reject burn from zero address", async function () {
      const { lingshi, burner } = await loadFixture(deployFixture);
      await expect(
        lingshi.connect(burner).burn(ethers.ZeroAddress, 100)
      ).to.be.revertedWith("LingShi: burn from zero");
    });

    it("should reject burn of zero amount", async function () {
      const { lingshi, minter, burner, user1 } = await loadFixture(deployFixture);
      await lingshi.connect(minter).mint(user1.address, 100);
      await expect(
        lingshi.connect(burner).burn(user1.address, 0)
      ).to.be.revertedWith("LingShi: zero amount");
    });
  });

  describe("ERC-20 Standard", function () {
    it("should transfer tokens between users", async function () {
      const { lingshi, minter, user1, user2 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await lingshi.connect(minter).mint(user1.address, amount);

      await lingshi.connect(user1).transfer(user2.address, ethers.parseEther("30"));
      expect(await lingshi.balanceOf(user1.address)).to.equal(ethers.parseEther("70"));
      expect(await lingshi.balanceOf(user2.address)).to.equal(ethers.parseEther("30"));
    });

    it("should approve and transferFrom", async function () {
      const { lingshi, minter, user1, user2 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await lingshi.connect(minter).mint(user1.address, amount);

      await lingshi.connect(user1).approve(user2.address, ethers.parseEther("50"));
      expect(await lingshi.allowance(user1.address, user2.address)).to.equal(
        ethers.parseEther("50")
      );

      await lingshi
        .connect(user2)
        .transferFrom(user1.address, user2.address, ethers.parseEther("30"));
      expect(await lingshi.balanceOf(user1.address)).to.equal(ethers.parseEther("70"));
      expect(await lingshi.balanceOf(user2.address)).to.equal(ethers.parseEther("30"));
    });
  });

  describe("Role Management", function () {
    it("should allow admin to grant and revoke MINTER_ROLE", async function () {
      const { lingshi, admin, user1, MINTER_ROLE } = await loadFixture(deployFixture);

      await lingshi.connect(admin).grantRole(MINTER_ROLE, user1.address);
      expect(await lingshi.hasRole(MINTER_ROLE, user1.address)).to.be.true;

      await lingshi.connect(admin).revokeRole(MINTER_ROLE, user1.address);
      expect(await lingshi.hasRole(MINTER_ROLE, user1.address)).to.be.false;
    });

    it("should reject non-admin granting roles", async function () {
      const { lingshi, user1, user2, MINTER_ROLE } = await loadFixture(deployFixture);
      await expect(
        lingshi.connect(user1).grantRole(MINTER_ROLE, user2.address)
      ).to.be.revertedWithCustomError(lingshi, "AccessControlUnauthorizedAccount");
    });
  });
});
