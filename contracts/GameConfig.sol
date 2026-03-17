// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IGameConfig.sol";
import "./libraries/Constants.sol";

/// @title GameConfig — 游戏参数配置中心（UUPS Proxy）
/// @notice 所有游戏合约从此处读取可治理参数
contract GameConfig is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    IGameConfig
{
    // ── 战斗参数 ──
    uint256 private _kRatioBP;
    uint256 private _restraintBaseBP;
    uint256 private _generationBP;

    // ── 金库分配 ──
    uint256 private _burnRatioBP;
    uint256 private _devRatioBP;
    uint256 private _foundationRatioBP;

    // ── 注册 ──
    uint256 private _initialLingShi;
    uint256 private _blockDelayWindow;

    // ── 神识梯度 (4 档：tier 0-3) ──
    uint256[4] private _perceptionThresholds;
    uint256[4] private _perceptionBonusBPs;

    // ── 道心/气运阈值 (2 档：tier 0-1 → mid/high) ──
    uint256[2] private _heartThresholds;
    uint256[2] private _fortuneThresholds;

    // ── Events ──
    event KRatioUpdated(uint256 oldValue, uint256 newValue);
    event RestraintBaseUpdated(uint256 oldValue, uint256 newValue);
    event GenerationUpdated(uint256 oldValue, uint256 newValue);
    event TreasuryRatiosUpdated(uint256 burn, uint256 dev, uint256 foundation);
    event InitialLingShiUpdated(uint256 oldValue, uint256 newValue);
    event BlockDelayWindowUpdated(uint256 oldValue, uint256 newValue);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        require(initialOwner != address(0), "GameConfig: zero address");

        __Ownable_init(initialOwner);

        // 战斗参数
        _kRatioBP = Constants.DEFAULT_K_RATIO_BP;
        _restraintBaseBP = Constants.DEFAULT_RESTRAINT_BP;
        _generationBP = Constants.DEFAULT_GENERATION_BP;

        // 金库分配
        _burnRatioBP = Constants.DEFAULT_BURN_RATIO_BP;
        _devRatioBP = Constants.DEFAULT_DEV_RATIO_BP;
        _foundationRatioBP = Constants.DEFAULT_FOUNDATION_RATIO_BP;

        // 注册
        _initialLingShi = Constants.DEFAULT_INITIAL_LINGSHI;
        _blockDelayWindow = Constants.DEFAULT_BLOCK_DELAY_WINDOW;

        // 神识梯度: [0, 250, 500, 750] → bonus [0, 500, 1000, 1500] bp
        _perceptionThresholds = [uint256(0), 250, 500, 750];
        _perceptionBonusBPs = [uint256(0), 500, 1000, 1500];

        // 道心/气运阈值: [mid=1000, high=3000]
        _heartThresholds = [uint256(1000), 3000];
        _fortuneThresholds = [uint256(1000), 3000];
    }

    // ═══════════════════════════════════════════
    //                  GETTERS
    // ═══════════════════════════════════════════

    function kRatioBP() external view override returns (uint256) {
        return _kRatioBP;
    }

    function restraintBaseBP() external view override returns (uint256) {
        return _restraintBaseBP;
    }

    function generationBP() external view override returns (uint256) {
        return _generationBP;
    }

    function burnRatioBP() external view override returns (uint256) {
        return _burnRatioBP;
    }

    function devRatioBP() external view override returns (uint256) {
        return _devRatioBP;
    }

    function foundationRatioBP() external view override returns (uint256) {
        return _foundationRatioBP;
    }

    function initialLingShi() external view override returns (uint256) {
        return _initialLingShi;
    }

    function blockDelayWindow() external view override returns (uint256) {
        return _blockDelayWindow;
    }

    function perceptionThreshold(uint8 tier) external view override returns (uint256) {
        require(tier < 4, "GameConfig: invalid tier");
        return _perceptionThresholds[tier];
    }

    function perceptionBonusBP(uint8 tier) external view override returns (uint256) {
        require(tier < 4, "GameConfig: invalid tier");
        return _perceptionBonusBPs[tier];
    }

    function heartThreshold(uint8 tier) external view override returns (uint256) {
        require(tier < 2, "GameConfig: invalid tier");
        return _heartThresholds[tier];
    }

    function fortuneThreshold(uint8 tier) external view override returns (uint256) {
        require(tier < 2, "GameConfig: invalid tier");
        return _fortuneThresholds[tier];
    }

    // ═══════════════════════════════════════════
    //                  SETTERS
    // ═══════════════════════════════════════════

    function setKRatio(uint256 newValue) external onlyOwner {
        require(newValue >= 3000 && newValue <= 15_000, "GameConfig: kRatio out of range");
        uint256 oldValue = _kRatioBP;
        _kRatioBP = newValue;
        emit KRatioUpdated(oldValue, newValue);
    }

    function setRestraintBase(uint256 newValue) external onlyOwner {
        require(newValue >= 10_000 && newValue <= 20_000, "GameConfig: restraint out of range");
        uint256 oldValue = _restraintBaseBP;
        _restraintBaseBP = newValue;
        emit RestraintBaseUpdated(oldValue, newValue);
    }

    function setGeneration(uint256 newValue) external onlyOwner {
        require(newValue >= 10_000 && newValue <= 15_000, "GameConfig: generation out of range");
        uint256 oldValue = _generationBP;
        _generationBP = newValue;
        emit GenerationUpdated(oldValue, newValue);
    }

    function setTreasuryRatios(
        uint256 burn,
        uint256 dev,
        uint256 foundation
    ) external onlyOwner {
        require(burn + dev + foundation == Constants.BP, "GameConfig: ratios must sum to 10000");
        _burnRatioBP = burn;
        _devRatioBP = dev;
        _foundationRatioBP = foundation;
        emit TreasuryRatiosUpdated(burn, dev, foundation);
    }

    function setInitialLingShi(uint256 newValue) external onlyOwner {
        require(newValue <= 1000 ether, "GameConfig: initialLingShi too large");
        uint256 oldValue = _initialLingShi;
        _initialLingShi = newValue;
        emit InitialLingShiUpdated(oldValue, newValue);
    }

    function setBlockDelayWindow(uint256 newValue) external onlyOwner {
        require(newValue >= 1 && newValue <= 256, "GameConfig: window out of range");
        uint256 oldValue = _blockDelayWindow;
        _blockDelayWindow = newValue;
        emit BlockDelayWindowUpdated(oldValue, newValue);
    }

    // ═══════════════════════════════════════════
    //               UUPS UPGRADE
    // ═══════════════════════════════════════════

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
