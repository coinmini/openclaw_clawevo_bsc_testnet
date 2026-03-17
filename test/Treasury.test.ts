import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { LingShi, Treasury, GameConfig } from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, activityContract, user1] =
    await ethers.getSigners();

  // Deploy GameConfig via proxy
  const ConfigFactory = await ethers.getContractFactory("GameConfig");
  const configProxy = await upgrades.deployProxy(ConfigFactory, [owner.address], {
    kind: "uups",
  });
  const config = configProxy as unknown as GameConfig;

  // Deploy LingShi
  const LingShiFactory = await ethers.getContractFactory("LingShi");
  const lingshi = (await LingShiFactory.deploy(owner.address)) as LingShi;

  // Deploy Treasury
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = (await TreasuryFactory.deploy(
    await lingshi.getAddress(),
    await config.getAddress(),
    devWallet.address,
    foundationWallet.address,
    owner.address
  )) as Treasury;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.connect(owner).grantRole(MINTER_ROLE, owner.address);
  await lingshi.connect(owner).grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize activity contract
  await treasury.connect(owner).setAuthorizedCaller(activityContract.address, true);

  return {
    config,
    lingshi,
    treasury,
    owner,
    devWallet,
    foundationWallet,
    activityContract,
    user1,
  };
}

describe("Treasury", function () {
  describe("Deployment", function () {
    it("should set correct addresses", async function () {
      const { treasury, lingshi, config, devWallet, foundationWallet } =
        await loadFixture(deployFixture);
      expect(await treasury.lingshi()).to.equal(await lingshi.getAddress());
      expect(await treasury.gameConfig()).to.equal(await config.getAddress());
      expect(await treasury.devWallet()).to.equal(devWallet.address);
      expect(await treasury.foundationWallet()).to.equal(foundationWallet.address);
    });

    it("should revert with zero addresses", async function () {
      const [owner, dev, foundation] = await ethers.getSigners();
      const ConfigFactory = await ethers.getContractFactory("GameConfig");
      const cfg = await upgrades.deployProxy(ConfigFactory, [owner.address], {
        kind: "uups",
      });
      const LingShiFactory = await ethers.getContractFactory("LingShi");
      const ls = await LingShiFactory.deploy(owner.address);

      const TreasuryFactory = await ethers.getContractFactory("Treasury");
      await expect(
        TreasuryFactory.deploy(
          ethers.ZeroAddress,
          await cfg.getAddress(),
          dev.address,
          foundation.address,
          owner.address
        )
      ).to.be.revertedWith("Treasury: zero lingshi");
    });

    it("should start with zero counters", async function () {
      const { treasury } = await loadFixture(deployFixture);
      expect(await treasury.totalBurned()).to.equal(0);
      expect(await treasury.totalDevDistributed()).to.equal(0);
      expect(await treasury.totalFoundationDistributed()).to.equal(0);
    });
  });

  describe("collectFee", function () {
    it("should distribute fees correctly (50/25/25)", async function () {
      const {
        lingshi,
        treasury,
        owner,
        devWallet,
        foundationWallet,
        activityContract,
        user1,
      } = await loadFixture(deployFixture);

      // Mint 1000 LS to user1
      const feeAmount = ethers.parseEther("1000");
      await lingshi.connect(owner).mint(user1.address, feeAmount);

      // User1 approves Treasury
      await lingshi
        .connect(user1)
        .approve(await treasury.getAddress(), feeAmount);

      // Activity contract calls collectFee
      await treasury
        .connect(activityContract)
        .collectFee(user1.address, feeAmount);

      // Verify distribution: 500 burned, 250 dev, 250 foundation
      expect(await treasury.totalBurned()).to.equal(ethers.parseEther("500"));
      expect(await treasury.totalDevDistributed()).to.equal(ethers.parseEther("250"));
      expect(await treasury.totalFoundationDistributed()).to.equal(
        ethers.parseEther("250")
      );

      // Verify balances
      expect(await lingshi.balanceOf(devWallet.address)).to.equal(
        ethers.parseEther("250")
      );
      expect(await lingshi.balanceOf(foundationWallet.address)).to.equal(
        ethers.parseEther("250")
      );
      expect(await lingshi.balanceOf(user1.address)).to.equal(0);

      // Total supply should decrease by burned amount
      expect(await lingshi.totalSupply()).to.equal(ethers.parseEther("500"));
    });

    it("should emit FeeCollected event", async function () {
      const { lingshi, treasury, owner, activityContract, user1 } =
        await loadFixture(deployFixture);

      const feeAmount = ethers.parseEther("100");
      await lingshi.connect(owner).mint(user1.address, feeAmount);
      await lingshi
        .connect(user1)
        .approve(await treasury.getAddress(), feeAmount);

      await expect(
        treasury.connect(activityContract).collectFee(user1.address, feeAmount)
      )
        .to.emit(treasury, "FeeCollected")
        .withArgs(
          user1.address,
          feeAmount,
          ethers.parseEther("50"),  // burned
          ethers.parseEther("25"),  // dev
          ethers.parseEther("25")   // foundation
        );
    });

    it("should handle odd amounts without losing wei", async function () {
      const { lingshi, treasury, owner, devWallet, foundationWallet, activityContract, user1 } =
        await loadFixture(deployFixture);

      // Use an amount that doesn't divide evenly: 33 wei
      const feeAmount = 33n;
      await lingshi.connect(owner).mint(user1.address, feeAmount);
      await lingshi
        .connect(user1)
        .approve(await treasury.getAddress(), feeAmount);

      await treasury
        .connect(activityContract)
        .collectFee(user1.address, feeAmount);

      // burn = 33 * 5000 / 10000 = 16
      // dev = 33 * 2500 / 10000 = 8
      // foundation = 33 - 16 - 8 = 9 (gets the rounding remainder)
      const burned = await treasury.totalBurned();
      const dev = await treasury.totalDevDistributed();
      const foundation = await treasury.totalFoundationDistributed();

      expect(burned + dev + foundation).to.equal(feeAmount);
      expect(burned).to.equal(16n);
      expect(dev).to.equal(8n);
      expect(foundation).to.equal(9n);
    });

    it("should reject zero amount", async function () {
      const { treasury, activityContract, user1 } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(activityContract).collectFee(user1.address, 0)
      ).to.be.revertedWith("Treasury: zero amount");
    });

    it("should reject zero payer", async function () {
      const { treasury, activityContract } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(activityContract).collectFee(ethers.ZeroAddress, 100)
      ).to.be.revertedWith("Treasury: zero payer");
    });

    it("should reject unauthorized caller", async function () {
      const { treasury, user1 } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(user1).collectFee(user1.address, 100)
      ).to.be.revertedWith("Treasury: unauthorized caller");
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to authorize callers", async function () {
      const { treasury, owner, user1 } = await loadFixture(deployFixture);
      await expect(treasury.connect(owner).setAuthorizedCaller(user1.address, true))
        .to.emit(treasury, "CallerAuthorized")
        .withArgs(user1.address, true);
      expect(await treasury.authorizedCallers(user1.address)).to.be.true;
    });

    it("should allow owner to deauthorize callers", async function () {
      const { treasury, owner, activityContract } = await loadFixture(deployFixture);
      await treasury
        .connect(owner)
        .setAuthorizedCaller(activityContract.address, false);
      expect(await treasury.authorizedCallers(activityContract.address)).to.be.false;
    });

    it("should allow owner to update dev wallet", async function () {
      const { treasury, owner, user1, devWallet } = await loadFixture(deployFixture);
      await expect(treasury.connect(owner).setDevWallet(user1.address))
        .to.emit(treasury, "DevWalletUpdated")
        .withArgs(devWallet.address, user1.address);
      expect(await treasury.devWallet()).to.equal(user1.address);
    });

    it("should allow owner to update foundation wallet", async function () {
      const { treasury, owner, user1, foundationWallet } =
        await loadFixture(deployFixture);
      await expect(treasury.connect(owner).setFoundationWallet(user1.address))
        .to.emit(treasury, "FoundationWalletUpdated")
        .withArgs(foundationWallet.address, user1.address);
      expect(await treasury.foundationWallet()).to.equal(user1.address);
    });

    it("should reject non-owner admin calls", async function () {
      const { treasury, user1 } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(user1).setAuthorizedCaller(user1.address, true)
      ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(
        treasury.connect(user1).setDevWallet(user1.address)
      ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(
        treasury.connect(user1).setFoundationWallet(user1.address)
      ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
    });

    it("should reject zero address for wallets", async function () {
      const { treasury, owner } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(owner).setDevWallet(ethers.ZeroAddress)
      ).to.be.revertedWith("Treasury: zero address");
      await expect(
        treasury.connect(owner).setFoundationWallet(ethers.ZeroAddress)
      ).to.be.revertedWith("Treasury: zero address");
      await expect(
        treasury.connect(owner).setAuthorizedCaller(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Treasury: zero address");
    });
  });
});
