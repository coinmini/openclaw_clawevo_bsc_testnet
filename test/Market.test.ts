import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";
import {
  LingShi,
  Register,
  GameConfig,
  Treasury,
  Equipment,
  Beast,
  Market,
  Pill,
} from "../typechain-types";

async function deployFixture() {
  const [owner, devWallet, foundationWallet, player1, player2, player3] =
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

  // Equipment
  const EquipmentFactory = await ethers.getContractFactory("Equipment");
  const equipment = (await EquipmentFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Equipment;

  // Beast
  const BeastFactory = await ethers.getContractFactory("Beast");
  const beast = (await BeastFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress(),
    await register.getAddress()
  )) as Beast;

  // Pill (ERC-1155)
  const PillFactory = await ethers.getContractFactory("Pill");
  const pill = (await PillFactory.deploy(owner.address)) as Pill;

  // Market
  const MarketFactory = await ethers.getContractFactory("Market");
  const market = (await MarketFactory.deploy(
    await lingshi.getAddress(),
    await treasury.getAddress()
  )) as Market;

  // Grant roles
  const MINTER_ROLE = await lingshi.MINTER_ROLE();
  const BURNER_ROLE = await lingshi.BURNER_ROLE();
  await lingshi.grantRole(MINTER_ROLE, owner.address);
  await lingshi.grantRole(MINTER_ROLE, await register.getAddress());
  await lingshi.grantRole(BURNER_ROLE, await treasury.getAddress());

  // Authorize treasury callers
  await treasury.setAuthorizedCaller(await market.getAddress(), true);

  // Grant GAME_CONTRACT_ROLE for test minting
  const EQUIP_GAME_ROLE = await equipment.GAME_CONTRACT_ROLE();
  await equipment.grantRole(EQUIP_GAME_ROLE, owner.address);
  const BEAST_GAME_ROLE = await beast.GAME_CONTRACT_ROLE();
  await beast.grantRole(BEAST_GAME_ROLE, owner.address);

  // Grant MINTER_ROLE on Pill for test minting
  const PILL_MINTER_ROLE = await pill.MINTER_ROLE();
  await pill.grantRole(PILL_MINTER_ROLE, owner.address);

  // Whitelist Equipment, Beast, and Pill in Market
  await market.setAllowedToken(await equipment.getAddress(), true);
  await market.setAllowedToken(await beast.getAddress(), true);
  await market.setAllowedToken(await pill.getAddress(), true);

  // Register players
  await register.connect(player1).registerIntent(0, 0, "仙人");
  await mine(1);
  await register.connect(player1).finalizeRegistration();

  await register.connect(player2).registerIntent(1, 0, "仙人");
  await mine(1);
  await register.connect(player2).finalizeRegistration();

  // Give players LS
  await lingshi.mint(player1.address, ethers.parseEther("10000"));
  await lingshi.mint(player2.address, ethers.parseEther("10000"));

  // Approve market for LS
  await lingshi.connect(player1).approve(await market.getAddress(), ethers.MaxUint256);
  await lingshi.connect(player2).approve(await market.getAddress(), ethers.MaxUint256);

  return {
    config,
    lingshi,
    treasury,
    register,
    equipment,
    beast,
    pill,
    market,
    owner,
    devWallet,
    foundationWallet,
    player1,
    player2,
    player3,
  };
}

describe("Market", function () {
  describe("Deployment", function () {
    it("should set correct contract addresses", async function () {
      const { market, lingshi, treasury } = await loadFixture(deployFixture);
      expect(await market.lingshi()).to.equal(await lingshi.getAddress());
      expect(await market.treasury()).to.equal(await treasury.getAddress());
    });

    it("should start with zero orders", async function () {
      const { market } = await loadFixture(deployFixture);
      expect(await market.nextOrderId()).to.equal(1);
      expect(await market.getActiveOrderCount()).to.equal(0);
    });

    it("should revert with zero addresses", async function () {
      const Factory = await ethers.getContractFactory("Market");
      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Market: zero lingshi");
    });
  });

  describe("setAllowedToken", function () {
    it("should allow owner to set allowed token", async function () {
      const { market, equipment } = await loadFixture(deployFixture);
      expect(await market.allowedTokens(await equipment.getAddress())).to.be.true;
    });

    it("should reject non-owner", async function () {
      const { market, player1 } = await loadFixture(deployFixture);
      await expect(
        market.connect(player1).setAllowedToken(player1.address, true)
      ).to.be.revertedWith("Market: not owner");
    });

    it("should reject zero address", async function () {
      const { market } = await loadFixture(deployFixture);
      await expect(
        market.setAllowedToken(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Market: zero address");
    });
  });

  describe("createOrder", function () {
    it("should create order and escrow NFT", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      // Mint equipment to player1
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      const tokenId = 1;

      // Approve market
      await equipment.connect(player1).approve(await market.getAddress(), tokenId);

      // Create order
      const price = ethers.parseEther("100");
      await expect(market.connect(player1).createOrder(
        await equipment.getAddress(), tokenId, price
      ))
        .to.emit(market, "OrderCreated")
        .withArgs(1, player1.address, await equipment.getAddress(), tokenId, price);

      // NFT should be in market
      expect(await equipment.ownerOf(tokenId)).to.equal(await market.getAddress());

      // Order data should be correct
      const order = await market.getOrder(1);
      expect(order.seller).to.equal(player1.address);
      expect(order.price).to.equal(price);
      expect(order.active).to.be.true;

      expect(await market.getActiveOrderCount()).to.equal(1);
    });

    it("should create order for Beast NFT", async function () {
      const { market, beast, player1 } = await loadFixture(deployFixture);

      await beast.mint(player1.address, 1, 0, 500, 0);
      const tokenId = 1;
      await beast.connect(player1).approve(await market.getAddress(), tokenId);

      const price = ethers.parseEther("200");
      await market.connect(player1).createOrder(
        await beast.getAddress(), tokenId, price
      );

      expect(await beast.ownerOf(tokenId)).to.equal(await market.getAddress());
      expect(await market.getActiveOrderCount()).to.equal(1);
    });

    it("should reject non-allowed token contract", async function () {
      const { market, player1 } = await loadFixture(deployFixture);
      await expect(
        market.connect(player1).createOrder(player1.address, 1, ethers.parseEther("100"))
      ).to.be.revertedWith("Market: token not allowed");
    });

    it("should reject zero price", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);

      await expect(
        market.connect(player1).createOrder(await equipment.getAddress(), 1, 0)
      ).to.be.revertedWith("Market: zero price");
    });

    it("should reject non-owner of token", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);

      await expect(
        market.connect(player2).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"))
      ).to.be.revertedWith("Market: not token owner");
    });

    it("should create multiple orders", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.mint(player1.address, 1, 1, 800, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await equipment.connect(player1).approve(await market.getAddress(), 2);

      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));
      await market.connect(player1).createOrder(await equipment.getAddress(), 2, ethers.parseEther("200"));

      expect(await market.getActiveOrderCount()).to.equal(2);
      expect(await market.nextOrderId()).to.equal(3);
    });
  });

  describe("cancelOrder", function () {
    it("should cancel order and return NFT", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));

      await expect(market.connect(player1).cancelOrder(1))
        .to.emit(market, "OrderCancelled")
        .withArgs(1, player1.address);

      // NFT back to player1
      expect(await equipment.ownerOf(1)).to.equal(player1.address);

      // Order no longer active
      const order = await market.getOrder(1);
      expect(order.active).to.be.false;
      expect(await market.getActiveOrderCount()).to.equal(0);
    });

    it("should reject non-seller", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));

      await expect(
        market.connect(player2).cancelOrder(1)
      ).to.be.revertedWith("Market: not seller");
    });

    it("should reject cancel on inactive order", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));
      await market.connect(player1).cancelOrder(1);

      await expect(
        market.connect(player1).cancelOrder(1)
      ).to.be.revertedWith("Market: order not active");
    });
  });

  describe("fillOrder", function () {
    it("should fill order, transfer NFT and payment", async function () {
      const { market, equipment, lingshi, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("100");
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      const sellerBefore = await lingshi.balanceOf(player1.address);
      const buyerBefore = await lingshi.balanceOf(player2.address);

      await expect(market.connect(player2).fillOrder(1))
        .to.emit(market, "OrderFilled");

      // NFT transferred to buyer
      expect(await equipment.ownerOf(1)).to.equal(player2.address);

      // Payment: price to seller, 2% fee to treasury
      const fee = (price * 200n) / 10000n; // 2%
      const sellerAfter = await lingshi.balanceOf(player1.address);
      const buyerAfter = await lingshi.balanceOf(player2.address);

      expect(sellerAfter - sellerBefore).to.equal(price);
      expect(buyerBefore - buyerAfter).to.equal(price + fee);

      // Order inactive
      const order = await market.getOrder(1);
      expect(order.active).to.be.false;
      expect(await market.getActiveOrderCount()).to.equal(0);
    });

    it("should correctly calculate 2% fee", async function () {
      const { market, equipment, lingshi, player1, player2, devWallet, foundationWallet } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("1000");
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      const fee = ethers.parseEther("20"); // 2% of 1000
      const buyerBefore = await lingshi.balanceOf(player2.address);

      await market.connect(player2).fillOrder(1);

      const buyerAfter = await lingshi.balanceOf(player2.address);
      expect(buyerBefore - buyerAfter).to.equal(price + fee);
    });

    it("should reject buying own order", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));

      await expect(
        market.connect(player1).fillOrder(1)
      ).to.be.revertedWith("Market: cannot buy own order");
    });

    it("should reject filling inactive order", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));
      await market.connect(player1).cancelOrder(1);

      await expect(
        market.connect(player2).fillOrder(1)
      ).to.be.revertedWith("Market: order not active");
    });

    it("should reject with insufficient LS", async function () {
      const { market, equipment, lingshi, player1, player3 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));

      // player3 has no LS
      await lingshi.connect(player3).approve(await market.getAddress(), ethers.MaxUint256);

      await expect(
        market.connect(player3).fillOrder(1)
      ).to.be.revertedWith("Market: insufficient LS");
    });
  });

  describe("view functions", function () {
    it("should return empty order for non-existent id", async function () {
      const { market } = await loadFixture(deployFixture);
      const order = await market.getOrder(999);
      expect(order.seller).to.equal(ethers.ZeroAddress);
      expect(order.active).to.be.false;
    });
  });

  // ── Anti-Sybil: Floor Price ──

  describe("setFloorPrice", function () {
    it("should allow owner to set floor price", async function () {
      const { market, equipment } = await loadFixture(deployFixture);
      const equipAddr = await equipment.getAddress();
      const price = ethers.parseEther("10");

      await expect(market.setFloorPrice(equipAddr, price))
        .to.emit(market, "FloorPriceUpdated")
        .withArgs(equipAddr, price);

      expect(await market.floorPrices(equipAddr)).to.equal(price);
    });

    it("should reject non-owner", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);
      await expect(
        market.connect(player1).setFloorPrice(await equipment.getAddress(), 1)
      ).to.be.revertedWith("Market: not owner");
    });

    it("should reject zero address", async function () {
      const { market } = await loadFixture(deployFixture);
      await expect(
        market.setFloorPrice(ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Market: zero address");
    });

    it("should allow updating floor price", async function () {
      const { market, equipment } = await loadFixture(deployFixture);
      const equipAddr = await equipment.getAddress();

      await market.setFloorPrice(equipAddr, ethers.parseEther("10"));
      await market.setFloorPrice(equipAddr, ethers.parseEther("15"));
      expect(await market.floorPrices(equipAddr)).to.equal(ethers.parseEther("15"));
    });
  });

  // ── Anti-Sybil: Managed Accounts ──

  describe("setManagedAccount", function () {
    it("should allow owner to mark managed account", async function () {
      const { market, player1 } = await loadFixture(deployFixture);

      await expect(market.setManagedAccount(player1.address, true))
        .to.emit(market, "ManagedAccountUpdated")
        .withArgs(player1.address, true);

      expect(await market.managedAccounts(player1.address)).to.be.true;
    });

    it("should allow owner to unmark managed account", async function () {
      const { market, player1 } = await loadFixture(deployFixture);
      await market.setManagedAccount(player1.address, true);
      await market.setManagedAccount(player1.address, false);
      expect(await market.managedAccounts(player1.address)).to.be.false;
    });

    it("should reject non-owner", async function () {
      const { market, player1, player2 } = await loadFixture(deployFixture);
      await expect(
        market.connect(player1).setManagedAccount(player2.address, true)
      ).to.be.revertedWith("Market: not owner");
    });

    it("should reject zero address", async function () {
      const { market } = await loadFixture(deployFixture);
      await expect(
        market.setManagedAccount(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Market: zero address");
    });
  });

  // ── Anti-Sybil: Managed Account Restrictions ──

  describe("managed account restrictions", function () {
    it("should prevent managed accounts from creating orders", async function () {
      const { market, equipment, player1 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);

      // Mark player1 as managed
      await market.setManagedAccount(player1.address, true);

      await expect(
        market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"))
      ).to.be.revertedWith("Market: managed accounts cannot sell");
    });

    it("should allow managed accounts to buy within floor price cap", async function () {
      const { market, equipment, lingshi, player1, player2 } = await loadFixture(deployFixture);

      // player1 lists equipment
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("12"); // within 10 * 1.5 = 15
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      // Set floor price to 10 LS
      await market.setFloorPrice(await equipment.getAddress(), ethers.parseEther("10"));

      // Mark player2 as managed
      await market.setManagedAccount(player2.address, true);

      // Should succeed: 12 LS ≤ 10 * 1.5 = 15 LS
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);
    });

    it("should reject managed account buying above floor price cap", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("16"); // above 10 * 1.5 = 15
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      // Set floor price to 10 LS
      await market.setFloorPrice(await equipment.getAddress(), ethers.parseEther("10"));

      // Mark player2 as managed
      await market.setManagedAccount(player2.address, true);

      await expect(
        market.connect(player2).fillOrder(1)
      ).to.be.revertedWith("Market: price exceeds floor cap");
    });

    it("should skip price check when no floor price is set", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("18"); // within daily limit, no floor price set
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      // Mark player2 as managed, but no floor price set
      await market.setManagedAccount(player2.address, true);

      // Should succeed: no floor price → no price cap (still has daily limit)
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);
    });

    it("should enforce daily spending limit for managed accounts", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      // Create two orders
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.mint(player1.address, 1, 1, 800, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await equipment.connect(player1).approve(await market.getAddress(), 2);

      const price1 = ethers.parseEther("15"); // 15 LS
      const price2 = ethers.parseEther("10"); // 10 LS → total 25 > 20 limit
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 2, price2);

      // Mark player2 as managed
      await market.setManagedAccount(player2.address, true);

      // First buy: 15 LS ≤ 20 LS limit → OK
      await market.connect(player2).fillOrder(1);

      // Second buy: 15 + 10 = 25 > 20 → REJECTED
      await expect(
        market.connect(player2).fillOrder(2)
      ).to.be.revertedWith("Market: daily limit exceeded");
    });

    it("should track daily spent correctly", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("10");
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      await market.setManagedAccount(player2.address, true);
      await market.connect(player2).fillOrder(1);

      expect(await market.getDailySpent(player2.address)).to.equal(price);
    });

    it("should not restrict normal (non-managed) accounts", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("500"); // way above any limit
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      // Set floor price to 10 LS (player2 is NOT managed)
      await market.setFloorPrice(await equipment.getAddress(), ethers.parseEther("10"));

      // Normal user can buy at any price
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);
    });

    it("should allow exact floor price cap boundary", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("15"); // exactly 10 * 1.5 = 15
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      await market.setFloorPrice(await equipment.getAddress(), ethers.parseEther("10"));
      await market.setManagedAccount(player2.address, true);

      // Exactly at cap boundary → should succeed
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);
    });

    it("should allow exact daily limit boundary", async function () {
      const { market, equipment, player1, player2 } = await loadFixture(deployFixture);

      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      const price = ethers.parseEther("20"); // exactly at 20 LS limit
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, price);

      await market.setManagedAccount(player2.address, true);

      // Exactly at limit → should succeed
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  ERC-1155 丹药交易
  // ══════════════════════════════════════════════════════════════

  describe("createOrder1155", function () {
    it("should create order and escrow ERC-1155 tokens", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);

      // Mint 10 筑基丹 to player1
      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);

      const price = ethers.parseEther("50");
      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, price)
      )
        .to.emit(market, "OrderCreated1155")
        .withArgs(1, player1.address, await pill.getAddress(), 0, 5, price);

      // 5 pills escrowed in market
      expect(await pill.balanceOf(await market.getAddress(), 0)).to.equal(5);
      // 5 remain with player
      expect(await pill.balanceOf(player1.address, 0)).to.equal(5);

      const order = await market.getOrder(1);
      expect(order.seller).to.equal(player1.address);
      expect(order.price).to.equal(price);
      expect(order.isERC1155).to.be.true;
      expect(order.amount).to.equal(5);
      expect(order.active).to.be.true;

      expect(await market.getActiveOrderCount()).to.equal(1);
    });

    it("should reject non-allowed token contract", async function () {
      const { market, player1 } = await loadFixture(deployFixture);
      await expect(
        market.connect(player1).createOrder1155(player1.address, 0, 5, ethers.parseEther("10"))
      ).to.be.revertedWith("Market: token not allowed");
    });

    it("should reject zero price", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);
      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);

      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, 0)
      ).to.be.revertedWith("Market: zero price");
    });

    it("should reject zero amount", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);
      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);

      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 0, ethers.parseEther("10"))
      ).to.be.revertedWith("Market: zero amount");
    });

    it("should reject insufficient balance", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);
      await pill.mint(player1.address, 0, 3);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);

      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 10, ethers.parseEther("10"))
      ).to.be.revertedWith("Market: insufficient balance");
    });

    it("should reject managed account seller", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);
      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      await market.setManagedAccount(player1.address, true);

      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("10"))
      ).to.be.revertedWith("Market: managed accounts cannot sell");
    });

    it("should reject without setApprovalForAll", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);
      await pill.mint(player1.address, 0, 10);
      // No approval

      await expect(
        market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("10"))
      ).to.be.reverted; // ERC1155: caller is not token owner or approved
    });
  });

  describe("cancelOrder (ERC-1155)", function () {
    it("should cancel and return ERC-1155 tokens to seller", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("50"));

      await expect(market.connect(player1).cancelOrder(1))
        .to.emit(market, "OrderCancelled")
        .withArgs(1, player1.address);

      // Tokens returned to seller
      expect(await pill.balanceOf(player1.address, 0)).to.equal(10);
      expect(await pill.balanceOf(await market.getAddress(), 0)).to.equal(0);

      const order = await market.getOrder(1);
      expect(order.active).to.be.false;
      expect(await market.getActiveOrderCount()).to.equal(0);
    });

    it("should reject non-seller cancellation", async function () {
      const { market, pill, player1, player2 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("50"));

      await expect(
        market.connect(player2).cancelOrder(1)
      ).to.be.revertedWith("Market: not seller");
    });
  });

  describe("fillOrder (ERC-1155)", function () {
    it("should fill order, transfer pills and payment", async function () {
      const { market, pill, lingshi, player1, player2 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 4, 20); // 20 培元丹
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      const price = ethers.parseEther("10");
      await market.connect(player1).createOrder1155(await pill.getAddress(), 4, 10, price);

      const sellerBefore = await lingshi.balanceOf(player1.address);
      const buyerBefore = await lingshi.balanceOf(player2.address);

      await expect(market.connect(player2).fillOrder(1))
        .to.emit(market, "OrderFilled");

      // Pills transferred to buyer
      expect(await pill.balanceOf(player2.address, 4)).to.equal(10);
      expect(await pill.balanceOf(await market.getAddress(), 4)).to.equal(0);

      // Payment: price to seller, 2% fee deducted from buyer
      const fee = (price * 200n) / 10000n;
      expect(await lingshi.balanceOf(player1.address) - sellerBefore).to.equal(price);
      expect(buyerBefore - await lingshi.balanceOf(player2.address)).to.equal(price + fee);

      const order = await market.getOrder(1);
      expect(order.active).to.be.false;
    });

    it("should reject buying own ERC-1155 order", async function () {
      const { market, pill, player1 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("10"));

      await expect(
        market.connect(player1).fillOrder(1)
      ).to.be.revertedWith("Market: cannot buy own order");
    });

    it("should enforce managed account floor price cap for ERC-1155", async function () {
      const { market, pill, player1, player2 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 0, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      const price = ethers.parseEther("16"); // above 10 * 1.5 = 15
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, price);

      await market.setFloorPrice(await pill.getAddress(), ethers.parseEther("10"));
      await market.setManagedAccount(player2.address, true);

      await expect(
        market.connect(player2).fillOrder(1)
      ).to.be.revertedWith("Market: price exceeds floor cap");
    });

    it("should enforce managed account daily limit for ERC-1155", async function () {
      const { market, pill, player1, player2 } = await loadFixture(deployFixture);

      await pill.mint(player1.address, 0, 20);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);

      // Two orders: 15 + 10 = 25 > 20 daily limit
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("15"));
      await market.connect(player1).createOrder1155(await pill.getAddress(), 0, 5, ethers.parseEther("10"));

      await market.setManagedAccount(player2.address, true);

      // First buy: 15 ≤ 20 → OK
      await market.connect(player2).fillOrder(1);

      // Second buy: 15 + 10 = 25 > 20 → REJECTED
      await expect(
        market.connect(player2).fillOrder(2)
      ).to.be.revertedWith("Market: daily limit exceeded");
    });
  });

  describe("mixed ERC-721 + ERC-1155 orders", function () {
    it("should handle mixed orders with sequential IDs", async function () {
      const { market, equipment, pill, player1, player2 } = await loadFixture(deployFixture);

      // ERC-721 order (orderId = 1)
      await equipment.mint(player1.address, 0, 0, 500, 0, 0, 0);
      await equipment.connect(player1).approve(await market.getAddress(), 1);
      await market.connect(player1).createOrder(await equipment.getAddress(), 1, ethers.parseEther("100"));

      // ERC-1155 order (orderId = 2)
      await pill.mint(player1.address, 4, 10);
      await pill.connect(player1).setApprovalForAll(await market.getAddress(), true);
      await market.connect(player1).createOrder1155(await pill.getAddress(), 4, 5, ethers.parseEther("10"));

      expect(await market.getActiveOrderCount()).to.equal(2);
      expect(await market.nextOrderId()).to.equal(3);

      // Verify order types
      const order1 = await market.getOrder(1);
      expect(order1.isERC1155).to.be.false;
      expect(order1.amount).to.equal(0);

      const order2 = await market.getOrder(2);
      expect(order2.isERC1155).to.be.true;
      expect(order2.amount).to.equal(5);

      // Fill ERC-721 order
      await market.connect(player2).fillOrder(1);
      expect(await equipment.ownerOf(1)).to.equal(player2.address);

      // Fill ERC-1155 order
      await market.connect(player2).fillOrder(2);
      expect(await pill.balanceOf(player2.address, 4)).to.equal(5);

      expect(await market.getActiveOrderCount()).to.equal(0);
    });
  });

  describe("IERC1155Receiver", function () {
    it("should support IERC1155Receiver interface", async function () {
      const { market } = await loadFixture(deployFixture);

      // IERC1155Receiver interfaceId = 0x4e2312e0
      expect(await market.supportsInterface("0x4e2312e0")).to.be.true;
    });

    it("should support IERC165 interface", async function () {
      const { market } = await loadFixture(deployFixture);

      // IERC165 interfaceId = 0x01ffc9a7
      expect(await market.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });
});
