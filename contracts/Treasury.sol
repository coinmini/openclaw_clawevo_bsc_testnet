// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/ILingShi.sol";
import "./interfaces/IGameConfig.sol";
import "./libraries/Constants.sol";

/// @title Treasury — 金库（手续费收取 + 50/25/25 分配 + 销毁）
/// @notice 活动合约调用 collectFee，Treasury 从 payer 拉取灵石并按比例分配
contract Treasury is Ownable, ITreasury {
    ILingShi public immutable lingshi;
    IGameConfig public immutable gameConfig;

    address public devWallet;
    address public foundationWallet;

    uint256 public totalBurned;
    uint256 public totalDevDistributed;
    uint256 public totalFoundationDistributed;

    // 授权的活动合约（可调用 collectFee）
    mapping(address => bool) public authorizedCallers;

    event CallerAuthorized(address indexed caller, bool authorized);
    event DevWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event FoundationWalletUpdated(address indexed oldWallet, address indexed newWallet);

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Treasury: unauthorized caller");
        _;
    }

    constructor(
        address _lingshi,
        address _gameConfig,
        address _devWallet,
        address _foundationWallet,
        address _owner
    ) Ownable(_owner) {
        require(_lingshi != address(0), "Treasury: zero lingshi");
        require(_gameConfig != address(0), "Treasury: zero config");
        require(_devWallet != address(0), "Treasury: zero dev wallet");
        require(_foundationWallet != address(0), "Treasury: zero foundation wallet");

        lingshi = ILingShi(_lingshi);
        gameConfig = IGameConfig(_gameConfig);
        devWallet = _devWallet;
        foundationWallet = _foundationWallet;
    }

    /// @notice 收取灵石手续费并按比例分配
    /// @param payer 支付方地址（需先 approve Treasury）
    /// @param amount 手续费总额
    function collectFee(address payer, uint256 amount) external override onlyAuthorized {
        require(payer != address(0), "Treasury: zero payer");
        require(amount > 0, "Treasury: zero amount");

        uint256 burnRatio = gameConfig.burnRatioBP();
        uint256 devRatio = gameConfig.devRatioBP();

        uint256 burnAmount = (amount * burnRatio) / Constants.BP;
        uint256 devAmount = (amount * devRatio) / Constants.BP;
        uint256 foundationAmount = amount - burnAmount - devAmount; // 余数归 foundation，不丢 wei

        // 从 payer 拉取灵石到 Treasury
        lingshi.transferFrom(payer, address(this), amount);

        // 销毁部分
        if (burnAmount > 0) {
            lingshi.burn(address(this), burnAmount);
            totalBurned += burnAmount;
        }

        // 开发团队部分
        if (devAmount > 0) {
            lingshi.transfer(devWallet, devAmount);
            totalDevDistributed += devAmount;
        }

        // 基金会部分
        if (foundationAmount > 0) {
            lingshi.transfer(foundationWallet, foundationAmount);
            totalFoundationDistributed += foundationAmount;
        }

        emit FeeCollected(payer, amount, burnAmount, devAmount, foundationAmount);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Treasury: zero address");
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    function setDevWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Treasury: zero address");
        address oldWallet = devWallet;
        devWallet = newWallet;
        emit DevWalletUpdated(oldWallet, newWallet);
    }

    function setFoundationWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Treasury: zero address");
        address oldWallet = foundationWallet;
        foundationWallet = newWallet;
        emit FoundationWalletUpdated(oldWallet, newWallet);
    }
}
