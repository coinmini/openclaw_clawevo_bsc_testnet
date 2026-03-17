import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";

/**
 * Integration tests for the full Account Abstraction flow:
 * Factory → GameAccount → Register → LingShi → Migration
 */

// ── Helpers ──

const EXECUTE_SELECTOR = "0xb61d27f6";

function makeUserOp(
  sender: string,
  target: string,
  innerCalldata: string = "0x",
  signature: string = "0x"
) {
  const callData = ethers.concat([
    EXECUTE_SELECTOR,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes"],
      [target, 0, innerCalldata]
    ),
  ]);

  return {
    sender,
    nonce: 0n,
    initCode: "0x",
    callData,
    accountGasLimits: ethers.ZeroHash,
    preVerificationGas: 0n,
    gasFees: ethers.ZeroHash,
    paymasterAndData: "0x",
    signature,
  };
}

// ── Fixture ──

async function deployFullStack() {
  const [deployer, ownerEOA, otherUser, migrationRecipient] =
    await ethers.getSigners();

  // Deploy MockEntryPoint
  const MockEP = await ethers.getContractFactory("MockEntryPoint");
  const mockEntryPoint = await MockEP.deploy();
  const entryPointAddr = await mockEntryPoint.getAddress();

  // Deploy GameConfig (UUPS Proxy)
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfig = await upgrades.deployProxy(GameConfig, [deployer.address], {
    kind: "uups",
  });
  const gameConfigAddr = await gameConfig.getAddress();

  // Deploy LingShi
  const LingShi = await ethers.getContractFactory("LingShi");
  const lingshi = await LingShi.deploy(deployer.address);
  const lingshiAddr = await lingshi.getAddress();

  // Deploy Register
  const Register = await ethers.getContractFactory("Register");
  const register = await Register.deploy(lingshiAddr, gameConfigAddr);
  const registerAddr = await register.getAddress();

  // Deploy Paymaster
  const Paymaster = await ethers.getContractFactory("Paymaster");
  const paymaster = await Paymaster.deploy(entryPointAddr, deployer.address);

  // Deploy GameAccountFactory
  const Factory = await ethers.getContractFactory("GameAccountFactory");
  const factory = await Factory.deploy(
    entryPointAddr,
    registerAddr,
    lingshiAddr,
    migrationRecipient.address,
    deployer.address
  );

  // ── Permissions ──
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await lingshi.grantRole(MINTER_ROLE, registerAddr);
  await lingshi.grantRole(MINTER_ROLE, deployer.address); // for test mint

  // Whitelist register in paymaster
  await paymaster.setWhitelistedTarget(registerAddr, true);

  // Set deployer as authorizedUpdater on register (for realm update in tests)
  await register.setAuthorizedUpdater(deployer.address, true);

  return {
    mockEntryPoint,
    entryPointAddr,
    gameConfig,
    lingshi,
    lingshiAddr,
    register,
    registerAddr,
    paymaster,
    factory,
    deployer,
    ownerEOA,
    otherUser,
    migrationRecipient,
  };
}

// ── Tests ──

describe("AccountAbstraction Integration", function () {
  describe("Full onboarding flow", function () {
    it("should create account → register cultivator → receive initial LS", async function () {
      const { factory, register, lingshi, ownerEOA } =
        await loadFixture(deployFullStack);

      // Step 1: Create account
      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);
      expect(accountAddr).to.not.equal(ethers.ZeroAddress);

      const GameAccount = await ethers.getContractFactory("GameAccount");
      const account = GameAccount.attach(accountAddr);
      expect(await account.managed()).to.be.true;

      // Step 2: Register via execute
      const registerIntentData = register.interface.encodeFunctionData(
        "registerIntent",
        [0, 0, "仙人"]
      );
      await account
        .connect(ownerEOA)
        .execute(await register.getAddress(), 0, registerIntentData);

      // Mine block for block-delay
      await mine(1);

      // Step 3: Finalize registration
      const finalizeData = register.interface.encodeFunctionData(
        "finalizeRegistration",
        []
      );
      await account
        .connect(ownerEOA)
        .execute(await register.getAddress(), 0, finalizeData);

      // Verify registration
      expect(await register.isRegistered(accountAddr)).to.be.true;

      // Verify initial LS received (20 LS from GameConfig default)
      const lsBal = await lingshi.balanceOf(accountAddr);
      expect(lsBal).to.be.gt(0);
    });
  });

  describe("Managed mode restrictions", function () {
    it("should block LS transfer in managed mode", async function () {
      const { factory, lingshi, lingshiAddr, ownerEOA, otherUser, deployer } =
        await loadFixture(deployFullStack);

      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);
      const GameAccount = await ethers.getContractFactory("GameAccount");
      const account = GameAccount.attach(accountAddr);

      // Mint some LS to account
      await lingshi.mint(accountAddr, 1000);

      // Try to transfer LS — should fail in managed mode
      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        100,
      ]);
      await expect(
        account.connect(ownerEOA).execute(lingshiAddr, 0, transferData)
      ).to.be.revertedWithCustomError(account, "ManagedTransferBlocked");
    });

    it("should allow LS transfer after migration via BNB payment", async function () {
      const { factory, lingshi, lingshiAddr, ownerEOA, otherUser, deployer } =
        await loadFixture(deployFullStack);

      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);
      const GameAccount = await ethers.getContractFactory("GameAccount");
      const account = GameAccount.attach(accountAddr);

      // Mint some LS to account
      await lingshi.mint(accountAddr, 1000);

      // Migrate by paying 0.005 BNB
      await factory
        .connect(ownerEOA)
        .migrateAccount(accountAddr, { value: ethers.parseEther("0.005") });
      expect(await account.managed()).to.be.false;

      // Now transfer should work
      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        100,
      ]);
      await account.connect(ownerEOA).execute(lingshiAddr, 0, transferData);
      expect(await lingshi.balanceOf(otherUser.address)).to.equal(100);
    });
  });

  describe("Migration via realm qualification", function () {
    it("should migrate for free after reaching 筑基 (realm=1)", async function () {
      const { factory, register, lingshi, lingshiAddr, ownerEOA, otherUser, deployer } =
        await loadFixture(deployFullStack);

      // Create account + register
      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);
      const GameAccount = await ethers.getContractFactory("GameAccount");
      const account = GameAccount.attach(accountAddr);

      // Register
      await account
        .connect(ownerEOA)
        .execute(
          await register.getAddress(),
          0,
          register.interface.encodeFunctionData("registerIntent", [0, 0, "仙人"])
        );
      await mine(1);

      await account
        .connect(ownerEOA)
        .execute(
          await register.getAddress(),
          0,
          register.interface.encodeFunctionData("finalizeRegistration", [])
        );

      // Set realm to 1 (筑基)
      await register.updateRealm(accountAddr, 1);

      // Migrate without BNB
      await factory.connect(ownerEOA).migrateAccount(accountAddr);
      expect(await account.managed()).to.be.false;

      // Verify LS transfer now works
      await lingshi.mint(accountAddr, 500);
      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        200,
      ]);
      await account.connect(ownerEOA).execute(lingshiAddr, 0, transferData);
      expect(await lingshi.balanceOf(otherUser.address)).to.equal(200);
    });
  });

  describe("Paymaster + GameAccount compatibility", function () {
    it("should validate UserOp through Paymaster whitelist", async function () {
      const {
        factory,
        mockEntryPoint,
        paymaster,
        register,
        registerAddr,
        ownerEOA,
      } = await loadFixture(deployFullStack);

      // Create account
      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);

      // Build a UserOp targeting register (whitelisted)
      const innerData = register.interface.encodeFunctionData(
        "registerIntent",
        [0, 0, "仙人"]
      );

      const op = makeUserOp(accountAddr, registerAddr, innerData);

      // Paymaster should accept this UserOp
      const [context, validationData] =
        await mockEntryPoint.callValidatePaymasterUserOp.staticCall(
          await paymaster.getAddress(),
          op,
          ethers.ZeroHash,
          0
        );

      expect(validationData).to.equal(0n);
      // Context should contain the sender (account address)
      const decodedSender = ethers.AbiCoder.defaultAbiCoder().decode(
        ["address"],
        context
      )[0];
      expect(decodedSender).to.equal(accountAddr);
    });

    it("should reject UserOp targeting non-whitelisted contract via Paymaster", async function () {
      const { factory, mockEntryPoint, paymaster, lingshiAddr, ownerEOA } =
        await loadFixture(deployFullStack);

      await factory.createAccount(ownerEOA.address);
      const accountAddr = await factory.accountOf(ownerEOA.address);

      // LingShi is NOT whitelisted in paymaster
      const op = makeUserOp(accountAddr, lingshiAddr);

      await expect(
        mockEntryPoint.callValidatePaymasterUserOp(
          await paymaster.getAddress(),
          op,
          ethers.ZeroHash,
          0
        )
      ).to.be.revertedWithCustomError(paymaster, "TargetNotWhitelisted");
    });
  });

  describe("Multiple accounts", function () {
    it("should create and manage multiple independent accounts", async function () {
      const { factory, ownerEOA, otherUser } =
        await loadFixture(deployFullStack);

      await factory.createAccount(ownerEOA.address);
      await factory.createAccount(otherUser.address);

      const addr1 = await factory.accountOf(ownerEOA.address);
      const addr2 = await factory.accountOf(otherUser.address);

      expect(addr1).to.not.equal(addr2);
      expect(await factory.isGameAccount(addr1)).to.be.true;
      expect(await factory.isGameAccount(addr2)).to.be.true;
      expect(await factory.totalAccounts()).to.equal(2);
    });
  });
});
