import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Pill } from "../typechain-types";

async function deployFixture() {
  const [owner, minter, player1, player2] = await ethers.getSigners();

  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // Grant MINTER_ROLE to minter
  const MINTER_ROLE = await pill.MINTER_ROLE();
  await pill.grantRole(MINTER_ROLE, minter.address);

  return { pill, owner, minter, player1, player2, MINTER_ROLE };
}

describe("Pill", function () {
  describe("Deployment", function () {
    it("should set admin role", async function () {
      const { pill, owner } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN = await pill.DEFAULT_ADMIN_ROLE();
      expect(await pill.hasRole(DEFAULT_ADMIN, owner.address)).to.be.true;
    });

    it("should have 8 pill types", async function () {
      const { pill } = await loadFixture(deployFixture);
      expect(await pill.PILL_TYPE_COUNT()).to.equal(8);
    });

    it("should revert with zero admin", async function () {
      const Factory = await ethers.getContractFactory("Pill");
      await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "Pill: zero admin"
      );
    });

    it("should define correct pill type constants", async function () {
      const { pill } = await loadFixture(deployFixture);
      expect(await pill.ZHUJI_DAN()).to.equal(0);
      expect(await pill.JIEDAN_DAN()).to.equal(1);
      expect(await pill.NINGYING_DAN()).to.equal(2);
      expect(await pill.HUASHEN_DAN()).to.equal(3);
      expect(await pill.PEIYUAN_DAN()).to.equal(4);
      expect(await pill.JULING_DAN()).to.equal(5);
      expect(await pill.XISUI_DAN()).to.equal(6);
      expect(await pill.HUXIN_DAN()).to.equal(7);
    });
  });

  describe("mint", function () {
    it("should mint pills to player", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await expect(pill.connect(minter).mint(player1.address, 0, 3))
        .to.emit(pill, "PillMinted")
        .withArgs(player1.address, 0, 3);

      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(3);
    });

    it("should mint different pill types independently", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 2); // 筑基丹 ×2
      await pill.connect(minter).mint(player1.address, 4, 5); // 培元丹 ×5

      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(2);
      expect(await pill.balanceOfPill(player1.address, 4)).to.equal(5);
      expect(await pill.balanceOfPill(player1.address, 1)).to.equal(0);
    });

    it("should reject mint from non-minter", async function () {
      const { pill, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.connect(player1).mint(player1.address, 0, 1)
      ).to.be.reverted;
    });

    it("should reject invalid pill type", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.connect(minter).mint(player1.address, 8, 1)
      ).to.be.revertedWith("Pill: invalid type");
    });

    it("should reject zero amount", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.connect(minter).mint(player1.address, 0, 0)
      ).to.be.revertedWith("Pill: zero amount");
    });
  });

  describe("burn", function () {
    it("should burn pills from player", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 5);
      await expect(pill.connect(minter).burn(player1.address, 0, 2))
        .to.emit(pill, "PillBurned")
        .withArgs(player1.address, 0, 2);

      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(3);
    });

    it("should revert burn with insufficient balance", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 1);
      await expect(
        pill.connect(minter).burn(player1.address, 0, 2)
      ).to.be.reverted; // ERC1155 insufficient balance
    });

    it("should reject burn from non-minter", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 5);
      await expect(
        pill.connect(player1).burn(player1.address, 0, 1)
      ).to.be.reverted;
    });

    it("should reject invalid pill type", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.connect(minter).burn(player1.address, 8, 1)
      ).to.be.revertedWith("Pill: invalid type");
    });

    it("should reject zero amount", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.connect(minter).burn(player1.address, 0, 0)
      ).to.be.revertedWith("Pill: zero amount");
    });
  });

  describe("balanceOfPill", function () {
    it("should return 0 for no pills", async function () {
      const { pill, player1 } = await loadFixture(deployFixture);
      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(0);
    });

    it("should reject invalid pill type query", async function () {
      const { pill, player1 } = await loadFixture(deployFixture);
      await expect(
        pill.balanceOfPill(player1.address, 8)
      ).to.be.revertedWith("Pill: invalid type");
    });
  });

  describe("getAllPillBalances", function () {
    it("should return all 8 balances", async function () {
      const { pill, minter, player1 } = await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 3);
      await pill.connect(minter).mint(player1.address, 4, 10);
      await pill.connect(minter).mint(player1.address, 7, 1);

      const balances = await pill.getAllPillBalances(player1.address);
      expect(balances[0]).to.equal(3);  // 筑基丹
      expect(balances[1]).to.equal(0);  // 结丹丹
      expect(balances[4]).to.equal(10); // 培元丹
      expect(balances[7]).to.equal(1);  // 护心丹
    });
  });

  describe("ERC-1155 standard", function () {
    it("should support ERC-1155 transfers", async function () {
      const { pill, minter, player1, player2 } =
        await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 5);

      // Player can transfer their own pills
      await pill
        .connect(player1)
        .safeTransferFrom(player1.address, player2.address, 0, 2, "0x");

      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(3);
      expect(await pill.balanceOfPill(player2.address, 0)).to.equal(2);
    });

    it("should support batch transfers", async function () {
      const { pill, minter, player1, player2 } =
        await loadFixture(deployFixture);

      await pill.connect(minter).mint(player1.address, 0, 5);
      await pill.connect(minter).mint(player1.address, 4, 10);

      await pill
        .connect(player1)
        .safeBatchTransferFrom(
          player1.address,
          player2.address,
          [0, 4],
          [2, 3],
          "0x"
        );

      expect(await pill.balanceOfPill(player1.address, 0)).to.equal(3);
      expect(await pill.balanceOfPill(player2.address, 0)).to.equal(2);
      expect(await pill.balanceOfPill(player1.address, 4)).to.equal(7);
      expect(await pill.balanceOfPill(player2.address, 4)).to.equal(3);
    });

    it("should support supportsInterface", async function () {
      const { pill } = await loadFixture(deployFixture);
      // ERC-1155 interface
      expect(await pill.supportsInterface("0xd9b67a26")).to.be.true;
      // AccessControl interface
      expect(await pill.supportsInterface("0x7965db0b")).to.be.true;
    });
  });

  describe("Access control", function () {
    it("should allow admin to grant minter role", async function () {
      const { pill, owner, player1, MINTER_ROLE } =
        await loadFixture(deployFixture);

      await pill.grantRole(MINTER_ROLE, player1.address);
      expect(await pill.hasRole(MINTER_ROLE, player1.address)).to.be.true;

      // Now player1 can mint
      await expect(pill.connect(player1).mint(player1.address, 0, 1)).to.not.be
        .reverted;
    });

    it("should allow admin to revoke minter role", async function () {
      const { pill, owner, minter, player1, MINTER_ROLE } =
        await loadFixture(deployFixture);

      await pill.revokeRole(MINTER_ROLE, minter.address);
      await expect(
        pill.connect(minter).mint(player1.address, 0, 1)
      ).to.be.reverted;
    });
  });
});
