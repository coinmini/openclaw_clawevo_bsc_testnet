import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// ── Constants ──

const EXECUTE_SELECTOR = "0xb61d27f6"; // execute(address,uint256,bytes)
const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)
const TRANSFER_FROM_SELECTOR = "0x23b872dd"; // transferFrom(address,address,uint256)
const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)

// ── Helpers ──

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

async function signUserOpHash(
  signer: { signMessage: (message: Uint8Array) => Promise<string> },
  userOpHash: string
): Promise<string> {
  return signer.signMessage(ethers.getBytes(userOpHash));
}

// ── Fixture ──

async function deployFixture() {
  const [deployer, ownerEOA, otherUser, attacker] = await ethers.getSigners();

  // Deploy MockEntryPoint
  const MockEP = await ethers.getContractFactory("MockEntryPoint");
  const mockEntryPoint = await MockEP.deploy();

  // Deploy LingShi (for managed mode restriction tests)
  const LingShi = await ethers.getContractFactory("LingShi");
  const lingshi = await LingShi.deploy(deployer.address);
  const lingshiAddr = await lingshi.getAddress();

  // Deploy GameAccount implementation
  const GameAccount = await ethers.getContractFactory("GameAccount");
  const impl = await GameAccount.deploy();

  // Clone manually for direct testing (simulating factory)
  const Clones = await ethers.getContractFactory("GameAccountFactory");
  // Instead of using Factory, manually deploy a fresh GameAccount for unit tests
  const account = await GameAccount.deploy();
  const entryPointAddr = await mockEntryPoint.getAddress();

  // Initialize (deployer acts as factory)
  await account.initialize(ownerEOA.address, entryPointAddr, lingshiAddr);

  // Grant MINTER_ROLE to deployer so we can mint LS for testing
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await lingshi.grantRole(MINTER_ROLE, deployer.address);

  // A random game contract address for testing
  const gameContract = ethers.Wallet.createRandom().address;

  return {
    mockEntryPoint,
    lingshi,
    lingshiAddr,
    account,
    impl,
    deployer,
    ownerEOA,
    otherUser,
    attacker,
    gameContract,
  };
}

// ── Tests ──

describe("GameAccount", function () {
  describe("Initialization", function () {
    it("should initialize with correct owner", async function () {
      const { account, ownerEOA } = await loadFixture(deployFixture);
      expect(await account.owner()).to.equal(ownerEOA.address);
    });

    it("should initialize in managed mode", async function () {
      const { account } = await loadFixture(deployFixture);
      expect(await account.managed()).to.be.true;
    });

    it("should set entryPoint correctly", async function () {
      const { account, mockEntryPoint } = await loadFixture(deployFixture);
      expect(await account.entryPoint()).to.equal(
        await mockEntryPoint.getAddress()
      );
    });

    it("should set lingshi correctly", async function () {
      const { account, lingshiAddr } = await loadFixture(deployFixture);
      expect(await account.lingshi()).to.equal(lingshiAddr);
    });

    it("should set factory to msg.sender", async function () {
      const { account, deployer } = await loadFixture(deployFixture);
      expect(await account.factory()).to.equal(deployer.address);
    });

    it("should reject double initialization", async function () {
      const { account, ownerEOA, mockEntryPoint, lingshiAddr } =
        await loadFixture(deployFixture);
      await expect(
        account.initialize(
          ownerEOA.address,
          await mockEntryPoint.getAddress(),
          lingshiAddr
        )
      ).to.be.revertedWithCustomError(account, "AlreadyInitialized");
    });
  });

  describe("validateUserOp", function () {
    it("should return 0 for valid owner signature", async function () {
      const { account, mockEntryPoint, ownerEOA, gameContract } =
        await loadFixture(deployFixture);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-op"));
      const signature = await signUserOpHash(ownerEOA, userOpHash);
      const op = makeUserOp(
        await account.getAddress(),
        gameContract,
        "0x",
        signature
      );

      const result = await mockEntryPoint.callValidateUserOp.staticCall(
        await account.getAddress(),
        op,
        userOpHash,
        0
      );
      expect(result).to.equal(0n); // SIG_VALIDATION_SUCCESS
    });

    it("should return 1 for invalid signature", async function () {
      const { account, mockEntryPoint, attacker, gameContract } =
        await loadFixture(deployFixture);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-op"));
      const signature = await signUserOpHash(attacker, userOpHash); // wrong signer
      const op = makeUserOp(
        await account.getAddress(),
        gameContract,
        "0x",
        signature
      );

      const result = await mockEntryPoint.callValidateUserOp.staticCall(
        await account.getAddress(),
        op,
        userOpHash,
        0
      );
      expect(result).to.equal(1n); // SIG_VALIDATION_FAILED
    });

    it("should revert when called by non-entryPoint", async function () {
      const { account, ownerEOA, gameContract } =
        await loadFixture(deployFixture);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-op"));
      const signature = await signUserOpHash(ownerEOA, userOpHash);
      const op = makeUserOp(
        await account.getAddress(),
        gameContract,
        "0x",
        signature
      );

      await expect(
        account.validateUserOp(op, userOpHash, 0)
      ).to.be.revertedWithCustomError(account, "OnlyEntryPoint");
    });

    it("should pay missingAccountFunds to entryPoint", async function () {
      const { account, mockEntryPoint, ownerEOA, gameContract, deployer } =
        await loadFixture(deployFixture);

      // Fund the account with some BNB
      await deployer.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("0.01"),
      });

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-op"));
      const signature = await signUserOpHash(ownerEOA, userOpHash);
      const op = makeUserOp(
        await account.getAddress(),
        gameContract,
        "0x",
        signature
      );

      const missingFunds = ethers.parseEther("0.001");
      const epAddr = await mockEntryPoint.getAddress();
      const balanceBefore = await ethers.provider.getBalance(epAddr);

      await mockEntryPoint.callValidateUserOp(
        await account.getAddress(),
        op,
        userOpHash,
        missingFunds
      );

      const balanceAfter = await ethers.provider.getBalance(epAddr);
      expect(balanceAfter - balanceBefore).to.equal(missingFunds);
    });
  });

  describe("execute (managed mode)", function () {
    it("should allow calls to non-lingshi targets", async function () {
      const { account, ownerEOA, lingshi, deployer } =
        await loadFixture(deployFixture);

      // Call something harmless — we'll use lingshi.balanceOf via execute
      const balanceOfData = lingshi.interface.encodeFunctionData("balanceOf", [
        ownerEOA.address,
      ]);

      // Owner can call execute directly
      await account
        .connect(ownerEOA)
        .execute(await lingshi.getAddress(), 0, balanceOfData);
    });

    it("should block LingShi.transfer in managed mode", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr, otherUser } =
        await loadFixture(deployFixture);

      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        100,
      ]);

      await expect(
        account.connect(ownerEOA).execute(lingshiAddr, 0, transferData)
      ).to.be.revertedWithCustomError(account, "ManagedTransferBlocked");
    });

    it("should block LingShi.transferFrom in managed mode", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr, otherUser } =
        await loadFixture(deployFixture);

      const transferFromData = lingshi.interface.encodeFunctionData(
        "transferFrom",
        [await account.getAddress(), otherUser.address, 100]
      );

      await expect(
        account.connect(ownerEOA).execute(lingshiAddr, 0, transferFromData)
      ).to.be.revertedWithCustomError(account, "ManagedTransferBlocked");
    });

    it("should block LingShi.approve in managed mode", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr, otherUser } =
        await loadFixture(deployFixture);

      const approveData = lingshi.interface.encodeFunctionData("approve", [
        otherUser.address,
        100,
      ]);

      await expect(
        account.connect(ownerEOA).execute(lingshiAddr, 0, approveData)
      ).to.be.revertedWithCustomError(account, "ManagedTransferBlocked");
    });

    it("should allow LingShi.balanceOf in managed mode (read-only)", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr } =
        await loadFixture(deployFixture);

      const balanceOfData = lingshi.interface.encodeFunctionData("balanceOf", [
        await account.getAddress(),
      ]);

      // balanceOf is not transfer/transferFrom/approve, should succeed
      await account.connect(ownerEOA).execute(lingshiAddr, 0, balanceOfData);
    });

    it("should revert if called by unauthorized address", async function () {
      const { account, attacker, gameContract } =
        await loadFixture(deployFixture);

      await expect(
        account.connect(attacker).execute(gameContract, 0, "0x")
      ).to.be.revertedWithCustomError(account, "OnlyEntryPointOrOwner");
    });
  });

  describe("execute (autonomous mode)", function () {
    it("should allow LingShi.transfer after migration", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr, deployer, otherUser } =
        await loadFixture(deployFixture);

      // Migrate: deployer is factory
      await account.connect(deployer).setManaged(false);
      expect(await account.managed()).to.be.false;

      // Mint some LS to account
      const accountAddr = await account.getAddress();
      await lingshi.mint(accountAddr, 1000);

      // Now transfer should work
      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        100,
      ]);

      await account.connect(ownerEOA).execute(lingshiAddr, 0, transferData);
      expect(await lingshi.balanceOf(otherUser.address)).to.equal(100);
    });
  });

  describe("executeBatch", function () {
    it("should execute multiple calls", async function () {
      const { account, ownerEOA, lingshi } = await loadFixture(deployFixture);

      const data1 = lingshi.interface.encodeFunctionData("balanceOf", [
        ownerEOA.address,
      ]);
      const data2 = lingshi.interface.encodeFunctionData("balanceOf", [
        await account.getAddress(),
      ]);
      const lingshiAddr = await lingshi.getAddress();

      await account
        .connect(ownerEOA)
        .executeBatch([lingshiAddr, lingshiAddr], [0, 0], [data1, data2]);
    });

    it("should enforce managed restrictions on each call in batch", async function () {
      const { account, ownerEOA, lingshi, lingshiAddr, otherUser } =
        await loadFixture(deployFixture);

      const balanceOfData = lingshi.interface.encodeFunctionData("balanceOf", [
        ownerEOA.address,
      ]);
      const transferData = lingshi.interface.encodeFunctionData("transfer", [
        otherUser.address,
        100,
      ]);

      await expect(
        account
          .connect(ownerEOA)
          .executeBatch(
            [lingshiAddr, lingshiAddr],
            [0, 0],
            [balanceOfData, transferData]
          )
      ).to.be.revertedWithCustomError(account, "ManagedTransferBlocked");
    });

    it("should revert on length mismatch", async function () {
      const { account, ownerEOA, gameContract } =
        await loadFixture(deployFixture);

      await expect(
        account
          .connect(ownerEOA)
          .executeBatch([gameContract], [0, 0], ["0x"])
      ).to.be.revertedWith("GameAccount: length mismatch");
    });
  });

  describe("setManaged", function () {
    it("should allow factory to set managed=false", async function () {
      const { account, deployer } = await loadFixture(deployFixture);

      await account.connect(deployer).setManaged(false);
      expect(await account.managed()).to.be.false;
    });

    it("should emit Migrated event when setting managed=false", async function () {
      const { account, deployer } = await loadFixture(deployFixture);

      await expect(account.connect(deployer).setManaged(false))
        .to.emit(account, "Migrated")
        .withArgs(await account.getAddress());
    });

    it("should reject non-factory caller", async function () {
      const { account, ownerEOA } = await loadFixture(deployFixture);

      await expect(
        account.connect(ownerEOA).setManaged(false)
      ).to.be.revertedWithCustomError(account, "OnlyFactory");
    });
  });

  describe("receive BNB", function () {
    it("should accept BNB transfers", async function () {
      const { account, deployer } = await loadFixture(deployFixture);
      const accountAddr = await account.getAddress();

      await deployer.sendTransaction({
        to: accountAddr,
        value: ethers.parseEther("0.1"),
      });

      expect(await ethers.provider.getBalance(accountAddr)).to.equal(
        ethers.parseEther("0.1")
      );
    });
  });
});
