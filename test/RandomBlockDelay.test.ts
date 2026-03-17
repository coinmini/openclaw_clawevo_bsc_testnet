import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { RandomBlockDelay } from "../typechain-types";

async function deployFixture() {
  const [owner, caller1, caller2, player1, player2, unauthorized] =
    await ethers.getSigners();

  const Factory = await ethers.getContractFactory("RandomBlockDelay");
  const rbd = (await Factory.deploy(owner.address)) as RandomBlockDelay;

  // Authorize caller1 and caller2
  await rbd.connect(owner).setAuthorizedCaller(caller1.address, true);
  await rbd.connect(owner).setAuthorizedCaller(caller2.address, true);

  return { rbd, owner, caller1, caller2, player1, player2, unauthorized };
}

describe("RandomBlockDelay", function () {
  describe("Deployment", function () {
    it("should set correct owner", async function () {
      const { rbd, owner } = await loadFixture(deployFixture);
      expect(await rbd.owner()).to.equal(owner.address);
    });

    it("should set default maxWindow to 256", async function () {
      const { rbd } = await loadFixture(deployFixture);
      expect(await rbd.maxWindow()).to.equal(256);
    });

    it("should start with nonce 0", async function () {
      const { rbd } = await loadFixture(deployFixture);
      expect(await rbd.nonce()).to.equal(0);
    });
  });

  describe("Admin", function () {
    it("should allow owner to set authorized caller", async function () {
      const { rbd, owner, unauthorized } = await loadFixture(deployFixture);
      await rbd.connect(owner).setAuthorizedCaller(unauthorized.address, true);
      expect(await rbd.authorizedCallers(unauthorized.address)).to.equal(true);
    });

    it("should allow owner to revoke authorized caller", async function () {
      const { rbd, owner, caller1 } = await loadFixture(deployFixture);
      await rbd.connect(owner).setAuthorizedCaller(caller1.address, false);
      expect(await rbd.authorizedCallers(caller1.address)).to.equal(false);
    });

    it("should revert if non-owner sets caller", async function () {
      const { rbd, caller1, unauthorized } = await loadFixture(deployFixture);
      await expect(
        rbd.connect(caller1).setAuthorizedCaller(unauthorized.address, true),
      ).to.be.revertedWithCustomError(rbd, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to set maxWindow", async function () {
      const { rbd, owner } = await loadFixture(deployFixture);
      await rbd.connect(owner).setMaxWindow(128);
      expect(await rbd.maxWindow()).to.equal(128);
    });

    it("should revert if maxWindow is 0", async function () {
      const { rbd, owner } = await loadFixture(deployFixture);
      await expect(rbd.connect(owner).setMaxWindow(0)).to.be.revertedWith(
        "RandomBlockDelay: invalid window",
      );
    });

    it("should revert if maxWindow exceeds 256", async function () {
      const { rbd, owner } = await loadFixture(deployFixture);
      await expect(rbd.connect(owner).setMaxWindow(257)).to.be.revertedWith(
        "RandomBlockDelay: invalid window",
      );
    });
  });

  describe("Commit", function () {
    it("should record block number on commit", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      const tx = await rbd.connect(caller1).commit(player1.address);
      const receipt = await tx.wait();
      const blockNumber = receipt!.blockNumber;

      expect(await rbd.connect(caller1).getCommitBlock(player1.address)).to.equal(
        blockNumber,
      );
    });

    it("should emit Committed event", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await expect(rbd.connect(caller1).commit(player1.address))
        .to.emit(rbd, "Committed")
        .withArgs(caller1.address, player1.address, (v: bigint) => v > 0n);
    });

    it("should revert on duplicate commit", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await expect(
        rbd.connect(caller1).commit(player1.address),
      ).to.be.revertedWithCustomError(rbd, "AlreadyCommitted");
    });

    it("should revert if unauthorized caller commits", async function () {
      const { rbd, unauthorized, player1 } = await loadFixture(deployFixture);

      await expect(
        rbd.connect(unauthorized).commit(player1.address),
      ).to.be.revertedWithCustomError(rbd, "NotAuthorized");
    });

    it("should allow same player from different callers", async function () {
      const { rbd, caller1, caller2, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      // Same player, different caller — should succeed
      await expect(rbd.connect(caller2).commit(player1.address)).to.not.be.reverted;

      // Both should have commits
      expect(
        await rbd.connect(caller1).getCommitBlock(player1.address),
      ).to.be.greaterThan(0);
      expect(
        await rbd.connect(caller2).getCommitBlock(player1.address),
      ).to.be.greaterThan(0);
    });

    it("should allow different players from same caller", async function () {
      const { rbd, caller1, player1, player2 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await expect(rbd.connect(caller1).commit(player2.address)).to.not.be.reverted;
    });
  });

  describe("Reveal", function () {
    it("should revert if no commit exists", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await expect(
        rbd.connect(caller1).reveal(player1.address),
      ).to.be.revertedWithCustomError(rbd, "NoCommit");
    });

    it("should revert with TooEarly via canReveal check", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      // In Hardhat auto-mine mode, each tx gets its own block, so commit and
      // reveal are never in the same block. We verify the TooEarly guard via
      // canReveal (view call), which evaluates at the latest mined block.
      // After commit at block N, canReveal sees block.number = N = commitBlock → false.
      await rbd.connect(caller1).commit(player1.address);

      // canReveal returns false because block.number <= commitBlock
      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(false);

      // After mining 1 block, canReveal returns true
      await mine(1);
      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(true);
    });

    it("should return non-zero random after 1 block delay", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1); // advance 1 block

      const tx = await rbd.connect(caller1).reveal(player1.address);
      const receipt = await tx.wait();

      // Check Revealed event was emitted with non-zero random
      const event = receipt!.logs.find(
        (log) => rbd.interface.parseLog(log)?.name === "Revealed",
      );
      expect(event).to.not.be.undefined;

      const parsed = rbd.interface.parseLog(event!);
      expect(parsed!.args.random).to.not.equal(0n);
    });

    it("should emit Revealed event", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1);

      await expect(rbd.connect(caller1).reveal(player1.address))
        .to.emit(rbd, "Revealed")
        .withArgs(caller1.address, player1.address, (v: bigint) => v > 0n);
    });

    it("should clear commit after reveal (prevent replay)", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1);
      await rbd.connect(caller1).reveal(player1.address);

      // Commit should be cleared
      expect(await rbd.connect(caller1).getCommitBlock(player1.address)).to.equal(0);

      // Second reveal should revert
      await expect(
        rbd.connect(caller1).reveal(player1.address),
      ).to.be.revertedWithCustomError(rbd, "NoCommit");
    });

    it("should increment nonce on each reveal", async function () {
      const { rbd, caller1, player1, player2 } = await loadFixture(deployFixture);

      expect(await rbd.nonce()).to.equal(0);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1);
      await rbd.connect(caller1).reveal(player1.address);
      expect(await rbd.nonce()).to.equal(1);

      await rbd.connect(caller1).commit(player2.address);
      await mine(1);
      await rbd.connect(caller1).reveal(player2.address);
      expect(await rbd.nonce()).to.equal(2);
    });

    it("should revert if window expired (257 blocks)", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(257); // exceed 256-block window

      await expect(
        rbd.connect(caller1).reveal(player1.address),
      ).to.be.revertedWithCustomError(rbd, "WindowExpired");
    });

    it("should work at maxWindow boundary (256 blocks)", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(255); // commit block + 255 = 256 blocks difference

      // Should still work at exactly 256
      await expect(rbd.connect(caller1).reveal(player1.address)).to.not.be.reverted;
    });

    it("should revert if unauthorized caller reveals", async function () {
      const { rbd, caller1, unauthorized, player1 } =
        await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1);

      // Different (unauthorized) caller cannot reveal
      await expect(
        rbd.connect(unauthorized).reveal(player1.address),
      ).to.be.revertedWithCustomError(rbd, "NotAuthorized");
    });

    it("should produce different randoms for different players", async function () {
      const { rbd, caller1, player1, player2 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await rbd.connect(caller1).commit(player2.address);
      await mine(1);

      const tx1 = await rbd.connect(caller1).reveal(player1.address);
      const receipt1 = await tx1.wait();
      const event1 = receipt1!.logs.find(
        (log) => rbd.interface.parseLog(log)?.name === "Revealed",
      );
      const random1 = rbd.interface.parseLog(event1!)!.args.random;

      const tx2 = await rbd.connect(caller1).reveal(player2.address);
      const receipt2 = await tx2.wait();
      const event2 = receipt2!.logs.find(
        (log) => rbd.interface.parseLog(log)?.name === "Revealed",
      );
      const random2 = rbd.interface.parseLog(event2!)!.args.random;

      expect(random1).to.not.equal(random2);
    });

    it("should allow re-commit after reveal", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      // First cycle
      await rbd.connect(caller1).commit(player1.address);
      await mine(1);
      await rbd.connect(caller1).reveal(player1.address);

      // Second cycle — should work fine
      await rbd.connect(caller1).commit(player1.address);
      await mine(1);
      await expect(rbd.connect(caller1).reveal(player1.address)).to.not.be.reverted;
    });
  });

  describe("canReveal", function () {
    it("should return false if no commit", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);
      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(false);
    });

    it("should return false in same block as commit", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      // In Hardhat auto-mine mode, commit is mined at block N.
      // A static call (canReveal) after that evaluates at block N (latest mined block).
      // canReveal requires block.number > commitBlock, i.e. N > N → false.
      await rbd.connect(caller1).commit(player1.address);
      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(false);
    });

    it("should return true after 1 block delay", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(1);

      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(true);
    });

    it("should return false after window expired", async function () {
      const { rbd, caller1, player1 } = await loadFixture(deployFixture);

      await rbd.connect(caller1).commit(player1.address);
      await mine(257);

      expect(await rbd.connect(caller1).canReveal(player1.address)).to.equal(false);
    });
  });
});
