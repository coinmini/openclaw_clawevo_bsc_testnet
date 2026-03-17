import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BinanceVRFConsumer, MockVRFCoordinator } from "../typechain-types";

const KEY_HASH = ethers.keccak256(ethers.toUtf8Bytes("testKeyHash"));
const SUB_ID = 1n;
const REQUEST_CONFIRMATIONS = 3;
const CALLBACK_GAS_LIMIT = 200_000;

async function deployFixture() {
  const [owner, caller1, caller2, player1, player2, unauthorized] =
    await ethers.getSigners();

  // Deploy mock coordinator
  const CoordinatorFactory = await ethers.getContractFactory("MockVRFCoordinator");
  const coordinator = (await CoordinatorFactory.deploy()) as MockVRFCoordinator;

  // Deploy VRF consumer
  const ConsumerFactory = await ethers.getContractFactory("BinanceVRFConsumer");
  const consumer = (await ConsumerFactory.deploy(
    await coordinator.getAddress(),
    owner.address,
    KEY_HASH,
    SUB_ID,
    REQUEST_CONFIRMATIONS,
    CALLBACK_GAS_LIMIT,
  )) as BinanceVRFConsumer;

  // Authorize caller1
  await consumer.connect(owner).setAuthorizedCaller(caller1.address, true);

  return { consumer, coordinator, owner, caller1, caller2, player1, player2, unauthorized };
}

describe("BinanceVRFConsumer", function () {
  // ── Deployment ──

  describe("Deployment", function () {
    it("should set correct owner", async function () {
      const { consumer, owner } = await loadFixture(deployFixture);
      expect(await consumer.owner()).to.equal(owner.address);
    });

    it("should set correct coordinator", async function () {
      const { consumer, coordinator } = await loadFixture(deployFixture);
      expect(await consumer.coordinator()).to.equal(await coordinator.getAddress());
    });

    it("should set correct config values", async function () {
      const { consumer } = await loadFixture(deployFixture);
      expect(await consumer.keyHash()).to.equal(KEY_HASH);
      expect(await consumer.subscriptionId()).to.equal(SUB_ID);
      expect(await consumer.requestConfirmations()).to.equal(REQUEST_CONFIRMATIONS);
      expect(await consumer.callbackGasLimit()).to.equal(CALLBACK_GAS_LIMIT);
    });

    it("should have no pending requests initially", async function () {
      const { consumer, player1 } = await loadFixture(deployFixture);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
      expect(await consumer.getResult(player1.address)).to.equal(0n);
    });
  });

  // ── Admin ──

  describe("Admin", function () {
    it("should allow owner to set authorized caller", async function () {
      const { consumer, owner, caller2 } = await loadFixture(deployFixture);
      await consumer.connect(owner).setAuthorizedCaller(caller2.address, true);
      expect(await consumer.authorizedCallers(caller2.address)).to.equal(true);
    });

    it("should allow owner to revoke authorized caller", async function () {
      const { consumer, owner, caller1 } = await loadFixture(deployFixture);
      await consumer.connect(owner).setAuthorizedCaller(caller1.address, false);
      expect(await consumer.authorizedCallers(caller1.address)).to.equal(false);
    });

    it("should revert if non-owner sets caller", async function () {
      const { consumer, caller1, unauthorized } = await loadFixture(deployFixture);
      await expect(
        consumer.connect(caller1).setAuthorizedCaller(unauthorized.address, true),
      ).to.be.revertedWithCustomError(consumer, "OwnableUnauthorizedAccount");
    });

    it("should reflect authorization in mapping", async function () {
      const { consumer, owner, unauthorized } = await loadFixture(deployFixture);
      expect(await consumer.authorizedCallers(unauthorized.address)).to.equal(false);
      await consumer.connect(owner).setAuthorizedCaller(unauthorized.address, true);
      expect(await consumer.authorizedCallers(unauthorized.address)).to.equal(true);
    });
  });

  // ── requestRandom ──

  describe("requestRandom", function () {
    it("should allow authorized caller to request successfully", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);
      await expect(consumer.connect(caller1).requestRandom(player1.address)).to.not.be
        .reverted;
    });

    it("should emit RandomRequested event", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);
      await expect(consumer.connect(caller1).requestRandom(player1.address))
        .to.emit(consumer, "RandomRequested")
        .withArgs(caller1.address, player1.address, 1n);
    });

    it("should store pendingRequest mapping", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);
      await consumer.connect(caller1).requestRandom(player1.address);
      expect(await consumer.pendingRequests(player1.address)).to.equal(1n);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(true);
    });

    it("should revert AlreadyPending if player already has pending request", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);
      await consumer.connect(caller1).requestRandom(player1.address);
      await expect(
        consumer.connect(caller1).requestRandom(player1.address),
      ).to.be.revertedWithCustomError(consumer, "AlreadyPending");
    });

    it("should revert NotAuthorized for unauthorized caller", async function () {
      const { consumer, unauthorized, player1 } = await loadFixture(deployFixture);
      await expect(
        consumer.connect(unauthorized).requestRandom(player1.address),
      ).to.be.revertedWithCustomError(consumer, "NotAuthorized");
    });
  });

  // ── fulfillRandomWords ──

  describe("fulfillRandomWords", function () {
    it("should allow coordinator to fulfill successfully", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await expect(
        coordinator.fulfillRandomWordsWithValue(1n, 42n),
      ).to.not.be.reverted;
    });

    it("should emit RandomFulfilled event", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await expect(coordinator.fulfillRandomWordsWithValue(1n, 12345n))
        .to.emit(consumer, "RandomFulfilled")
        .withArgs(player1.address, 1n, 12345n);
    });

    it("should store result in fulfilledResults", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 99999n);

      expect(await consumer.fulfilledResults(player1.address)).to.equal(99999n);
      expect(await consumer.getResult(player1.address)).to.equal(99999n);
    });

    it("should clear pendingRequest after fulfillment", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(true);

      await coordinator.fulfillRandomWordsWithValue(1n, 42n);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
      expect(await consumer.pendingRequests(player1.address)).to.equal(0n);
    });

    it("should clear requestToPlayer after fulfillment", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      expect(await consumer.requestToPlayer(1n)).to.equal(player1.address);

      await coordinator.fulfillRandomWordsWithValue(1n, 42n);
      expect(await consumer.requestToPlayer(1n)).to.equal(ethers.ZeroAddress);
    });

    it("should handle different players with different results", async function () {
      const { consumer, coordinator, owner, caller1, player1, player2 } =
        await loadFixture(deployFixture);

      // Authorize caller1 is already done in fixture
      await consumer.connect(caller1).requestRandom(player1.address);
      await consumer.connect(caller1).requestRandom(player2.address);

      await coordinator.fulfillRandomWordsWithValue(1n, 111n);
      await coordinator.fulfillRandomWordsWithValue(2n, 222n);

      expect(await consumer.getResult(player1.address)).to.equal(111n);
      expect(await consumer.getResult(player2.address)).to.equal(222n);
    });

    it("should revert if called by non-coordinator", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);

      // Try to call rawFulfillRandomWords directly from a non-coordinator address
      await expect(
        consumer.connect(caller1).rawFulfillRandomWords(1n, [42n]),
      ).to.be.revertedWithCustomError(consumer, "OnlyCoordinator");
    });
  });

  // ── consumeResult ──

  describe("consumeResult", function () {
    it("should allow authorized caller to consume result", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 42n);

      await expect(consumer.connect(caller1).consumeResult(player1.address)).to.not.be
        .reverted;
    });

    it("should return correct random word", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 77777n);

      const tx = await consumer.connect(caller1).consumeResult(player1.address);
      const receipt = await tx.wait();

      // Verify via getResult that the result was consumed (now 0)
      expect(await consumer.getResult(player1.address)).to.equal(0n);
    });

    it("should clear result after consume (prevent replay)", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 42n);

      // First consume succeeds
      await consumer.connect(caller1).consumeResult(player1.address);

      // Second consume should revert — result already consumed
      await expect(
        consumer.connect(caller1).consumeResult(player1.address),
      ).to.be.revertedWithCustomError(consumer, "NoResult");
    });

    it("should revert NoResult if not fulfilled", async function () {
      const { consumer, caller1, player1 } = await loadFixture(deployFixture);

      await expect(
        consumer.connect(caller1).consumeResult(player1.address),
      ).to.be.revertedWithCustomError(consumer, "NoResult");
    });

    it("should revert NotAuthorized for unauthorized caller", async function () {
      const { consumer, coordinator, caller1, unauthorized, player1 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 42n);

      await expect(
        consumer.connect(unauthorized).consumeResult(player1.address),
      ).to.be.revertedWithCustomError(consumer, "NotAuthorized");
    });
  });

  // ── Full Lifecycle ──

  describe("Full Lifecycle", function () {
    it("should support request -> fulfill -> consume -> request again", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      // Cycle 1
      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(1n, 100n);
      await consumer.connect(caller1).consumeResult(player1.address);

      // Verify clean state
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
      expect(await consumer.getResult(player1.address)).to.equal(0n);

      // Cycle 2 — should work fine
      await consumer.connect(caller1).requestRandom(player1.address);
      await coordinator.fulfillRandomWordsWithValue(2n, 200n);

      expect(await consumer.getResult(player1.address)).to.equal(200n);
      await consumer.connect(caller1).consumeResult(player1.address);
      expect(await consumer.getResult(player1.address)).to.equal(0n);
    });

    it("should handle multiple concurrent players", async function () {
      const { consumer, coordinator, caller1, player1, player2 } =
        await loadFixture(deployFixture);

      // Both players request
      await consumer.connect(caller1).requestRandom(player1.address);
      await consumer.connect(caller1).requestRandom(player2.address);

      expect(await consumer.hasPendingRequest(player1.address)).to.equal(true);
      expect(await consumer.hasPendingRequest(player2.address)).to.equal(true);

      // Fulfill both
      await coordinator.fulfillRandomWordsWithValue(1n, 111n);
      await coordinator.fulfillRandomWordsWithValue(2n, 222n);

      // Consume both
      await consumer.connect(caller1).consumeResult(player1.address);
      await consumer.connect(caller1).consumeResult(player2.address);

      expect(await consumer.getResult(player1.address)).to.equal(0n);
      expect(await consumer.getResult(player2.address)).to.equal(0n);
    });

    it("should not affect other players when one is fulfilled", async function () {
      const { consumer, coordinator, caller1, player1, player2 } =
        await loadFixture(deployFixture);

      await consumer.connect(caller1).requestRandom(player1.address);
      await consumer.connect(caller1).requestRandom(player2.address);

      // Fulfill only player1
      await coordinator.fulfillRandomWordsWithValue(1n, 111n);

      // Player1 fulfilled, player2 still pending
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
      expect(await consumer.getResult(player1.address)).to.equal(111n);

      expect(await consumer.hasPendingRequest(player2.address)).to.equal(true);
      expect(await consumer.getResult(player2.address)).to.equal(0n);
    });

    it("should increment requestIds across requests", async function () {
      const { consumer, coordinator, caller1, player1, player2 } =
        await loadFixture(deployFixture);

      // First request -> requestId = 1
      await expect(consumer.connect(caller1).requestRandom(player1.address))
        .to.emit(consumer, "RandomRequested")
        .withArgs(caller1.address, player1.address, 1n);

      // Second request -> requestId = 2
      await expect(consumer.connect(caller1).requestRandom(player2.address))
        .to.emit(consumer, "RandomRequested")
        .withArgs(caller1.address, player2.address, 2n);

      // Fulfill and consume player1, then re-request -> requestId = 3
      await coordinator.fulfillRandomWordsWithValue(1n, 42n);
      await consumer.connect(caller1).consumeResult(player1.address);

      await expect(consumer.connect(caller1).requestRandom(player1.address))
        .to.emit(consumer, "RandomRequested")
        .withArgs(caller1.address, player1.address, 3n);
    });
  });

  // ── View Functions ──

  describe("View Functions", function () {
    it("should report correct hasPendingRequest states", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      // Initially no pending request
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);

      // After request -> pending
      await consumer.connect(caller1).requestRandom(player1.address);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(true);

      // After fulfillment -> no longer pending
      await coordinator.fulfillRandomWordsWithValue(1n, 42n);
      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
    });

    it("should report correct getResult states", async function () {
      const { consumer, coordinator, caller1, player1 } =
        await loadFixture(deployFixture);

      // Initially no result
      expect(await consumer.getResult(player1.address)).to.equal(0n);

      // After request -> still no result
      await consumer.connect(caller1).requestRandom(player1.address);
      expect(await consumer.getResult(player1.address)).to.equal(0n);

      // After fulfillment -> result available
      await coordinator.fulfillRandomWordsWithValue(1n, 55555n);
      expect(await consumer.getResult(player1.address)).to.equal(55555n);

      // After consume -> result cleared
      await consumer.connect(caller1).consumeResult(player1.address);
      expect(await consumer.getResult(player1.address)).to.equal(0n);
    });

    it("should return zero for players with no history", async function () {
      const { consumer, player1, player2 } = await loadFixture(deployFixture);

      expect(await consumer.hasPendingRequest(player1.address)).to.equal(false);
      expect(await consumer.hasPendingRequest(player2.address)).to.equal(false);
      expect(await consumer.getResult(player1.address)).to.equal(0n);
      expect(await consumer.getResult(player2.address)).to.equal(0n);
      expect(await consumer.pendingRequests(player1.address)).to.equal(0n);
      expect(await consumer.fulfilledResults(player1.address)).to.equal(0n);
    });
  });
});
