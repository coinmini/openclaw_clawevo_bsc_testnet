// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IMarket.sol";
import "./libraries/Constants.sol";

/// @title Market — 坊市交易（链上订单簿，支持 ERC-721 + ERC-1155）
/// @notice 卖家挂单托管 NFT/丹药，买家接单支付灵石 + 手续费
contract Market is IMarket, IERC1155Receiver {
    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    address public owner;

    // ── 白名单 ──
    mapping(address => bool) public allowedTokens;

    // ── 订单 ──
    mapping(uint256 => Order) private _orders;
    uint256 public nextOrderId;
    uint256 public activeOrderCount;

    // ── Anti-Sybil: 地板价 ──
    /// @notice 每个合约的地板价（owner 手动设置）
    mapping(address => uint256) public override floorPrices;

    // ── Anti-Sybil: 托管账户 ──
    /// @notice 托管账户标记（受限制的 AI Agent 账户）
    mapping(address => bool) public override managedAccounts;

    // ── Anti-Sybil: 每日购买限额 ──
    /// @notice 托管账户每日已花费灵石: account → day → amount
    mapping(address => mapping(uint256 => uint256)) private _dailySpent;

    /// @notice 托管账户每日购买上限
    uint256 public managedDailyLimit;

    /// @notice 托管账户价格保护倍数（地板价的 150%）
    uint256 public managedPriceCapBP;

    /// @notice 交易手续费率 (BP)
    uint256 public marketFeeBP;

    // ── Events ──
    event OrderCreated(uint256 indexed orderId, address indexed seller, address tokenContract, uint256 tokenId, uint256 price);
    event OrderCreated1155(uint256 indexed orderId, address indexed seller, address tokenContract, uint256 tokenId, uint256 amount, uint256 price);
    event OrderCancelled(uint256 indexed orderId, address indexed seller);
    event OrderFilled(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 price, uint256 fee);
    event TokenAllowed(address indexed tokenContract, bool allowed);
    event FloorPriceUpdated(address indexed tokenContract, uint256 price);
    event ManagedAccountUpdated(address indexed account, bool managed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Market: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury
    ) {
        require(_lingshi != address(0), "Market: zero lingshi");
        require(_treasury != address(0), "Market: zero treasury");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        owner = msg.sender;
        nextOrderId = 1;
        managedDailyLimit = 20 ether;
        managedPriceCapBP = 15_000;
        marketFeeBP = Constants.MARKET_FEE_BP;
    }

    // ── 白名单管理 ──

    /// @notice 设置允许交易的合约（ERC-721 或 ERC-1155）
    function setAllowedToken(address tokenContract, bool allowed) external onlyOwner {
        require(tokenContract != address(0), "Market: zero address");
        allowedTokens[tokenContract] = allowed;
        emit TokenAllowed(tokenContract, allowed);
    }

    // ── Anti-Sybil 管理 ──

    /// @notice 设置合约地板价
    function setFloorPrice(address tokenContract, uint256 price) external onlyOwner {
        require(tokenContract != address(0), "Market: zero address");
        floorPrices[tokenContract] = price;
        emit FloorPriceUpdated(tokenContract, price);
    }

    /// @notice 标记/取消托管账户
    function setManagedAccount(address account, bool managed) external onlyOwner {
        require(account != address(0), "Market: zero address");
        managedAccounts[account] = managed;
        emit ManagedAccountUpdated(account, managed);
    }

    /// @notice 查询托管账户当天已花费灵石
    function getDailySpent(address account) external view returns (uint256) {
        return _dailySpent[account][_currentDay()];
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    event ManagedDailyLimitUpdated(uint256 oldValue, uint256 newValue);
    event ManagedPriceCapBPUpdated(uint256 oldValue, uint256 newValue);
    event MarketFeeBPUpdated(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function setManagedDailyLimit(uint256 newValue) external onlyOwner {
        uint256 old = managedDailyLimit;
        managedDailyLimit = newValue;
        emit ManagedDailyLimitUpdated(old, newValue);
    }

    function setManagedPriceCapBP(uint256 newValue) external onlyOwner {
        require(newValue >= Constants.BP, "Market: cap < 100%");
        uint256 old = managedPriceCapBP;
        managedPriceCapBP = newValue;
        emit ManagedPriceCapBPUpdated(old, newValue);
    }

    function setMarketFeeBP(uint256 newValue) external onlyOwner {
        require(newValue <= 1000, "Market: fee > 10%");
        uint256 old = marketFeeBP;
        marketFeeBP = newValue;
        emit MarketFeeBPUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Market: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── ERC-721 挂单 ──

    /// @notice 创建 ERC-721 卖单，NFT 托管到 Market 合约
    function createOrder(address tokenContract, uint256 tokenId, uint256 price) external returns (uint256) {
        require(allowedTokens[tokenContract], "Market: token not allowed");
        require(price > 0, "Market: zero price");

        // 托管账户不能挂单出售
        require(!managedAccounts[msg.sender], "Market: managed accounts cannot sell");

        IERC721 nft = IERC721(tokenContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Market: not token owner");

        // 托管 NFT
        nft.transferFrom(msg.sender, address(this), tokenId);

        uint256 orderId = nextOrderId++;
        _orders[orderId] = Order({
            seller: msg.sender,
            tokenContract: tokenContract,
            tokenId: tokenId,
            price: price,
            createdAt: block.timestamp,
            active: true,
            isERC1155: false,
            amount: 0
        });
        activeOrderCount++;

        emit OrderCreated(orderId, msg.sender, tokenContract, tokenId, price);
        return orderId;
    }

    // ── ERC-1155 挂单 ──

    /// @notice 创建 ERC-1155 卖单，代币托管到 Market 合约
    /// @param tokenContract ERC-1155 合约地址（如 Pill）
    /// @param tokenId 代币类型 ID（如丹药类型 0-7）
    /// @param amount 出售数量
    /// @param price 总价（灵石）
    function createOrder1155(
        address tokenContract,
        uint256 tokenId,
        uint256 amount,
        uint256 price
    ) external returns (uint256) {
        require(allowedTokens[tokenContract], "Market: token not allowed");
        require(price > 0, "Market: zero price");
        require(amount > 0, "Market: zero amount");

        // 托管账户不能挂单出售
        require(!managedAccounts[msg.sender], "Market: managed accounts cannot sell");

        // 检查余额
        require(
            IERC1155(tokenContract).balanceOf(msg.sender, tokenId) >= amount,
            "Market: insufficient balance"
        );

        // 托管 ERC-1155 代币（卖家需先 setApprovalForAll）
        IERC1155(tokenContract).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        uint256 orderId = nextOrderId++;
        _orders[orderId] = Order({
            seller: msg.sender,
            tokenContract: tokenContract,
            tokenId: tokenId,
            price: price,
            createdAt: block.timestamp,
            active: true,
            isERC1155: true,
            amount: amount
        });
        activeOrderCount++;

        emit OrderCreated1155(orderId, msg.sender, tokenContract, tokenId, amount, price);
        return orderId;
    }

    // ── 撤单 ──

    /// @notice 卖家撤销挂单，代币退回
    function cancelOrder(uint256 orderId) external {
        Order storage order = _orders[orderId];
        require(order.active, "Market: order not active");
        require(order.seller == msg.sender, "Market: not seller");

        order.active = false;
        activeOrderCount--;

        // 退回代币
        if (order.isERC1155) {
            IERC1155(order.tokenContract).safeTransferFrom(
                address(this), msg.sender, order.tokenId, order.amount, ""
            );
        } else {
            IERC721(order.tokenContract).transferFrom(address(this), msg.sender, order.tokenId);
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    // ── 接单 ──

    /// @notice 买家接单，支付灵石给卖家 + 手续费给 Treasury
    function fillOrder(uint256 orderId) external {
        Order storage order = _orders[orderId];
        require(order.active, "Market: order not active");
        require(msg.sender != order.seller, "Market: cannot buy own order");

        uint256 price = order.price;

        // ── Anti-Sybil: 托管账户限制 ──
        if (managedAccounts[msg.sender]) {
            // 价格保护: price ≤ floorPrice × 1.5
            uint256 floor = floorPrices[order.tokenContract];
            if (floor > 0) {
                uint256 maxPrice = (floor * managedPriceCapBP) / Constants.BP;
                require(price <= maxPrice, "Market: price exceeds floor cap");
            }

            // 每日限额: 当天累计 ≤ managedDailyLimit
            uint256 day = _currentDay();
            uint256 spent = _dailySpent[msg.sender][day];
            require(spent + price <= managedDailyLimit, "Market: daily limit exceeded");
            _dailySpent[msg.sender][day] = spent + price;
        }

        uint256 fee = (price * marketFeeBP) / Constants.BP;
        uint256 totalCost = price + fee;

        require(lingshi.balanceOf(msg.sender) >= totalCost, "Market: insufficient LS");

        order.active = false;
        activeOrderCount--;

        // 支付给卖家
        lingshi.transferFrom(msg.sender, order.seller, price);

        // 手续费给 Treasury
        if (fee > 0) {
            lingshi.transferFrom(msg.sender, address(this), fee);
            lingshi.approve(address(treasury), fee);
            treasury.collectFee(address(this), fee);
        }

        // 转移代币给买家
        if (order.isERC1155) {
            IERC1155(order.tokenContract).safeTransferFrom(
                address(this), msg.sender, order.tokenId, order.amount, ""
            );
        } else {
            IERC721(order.tokenContract).transferFrom(address(this), msg.sender, order.tokenId);
        }

        emit OrderFilled(orderId, msg.sender, order.seller, price, fee);
    }

    // ── View ──

    /// @notice 查询订单
    function getOrder(uint256 orderId) external view override returns (Order memory) {
        return _orders[orderId];
    }

    /// @notice 查询活跃订单数
    function getActiveOrderCount() external view override returns (uint256) {
        return activeOrderCount;
    }

    // ── IERC1155Receiver ──

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }

    // ── Internal ──

    /// @dev 当前 UTC 天数 (用于每日限额)
    function _currentDay() private view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
