// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IPill.sol";

/// @title Pill — 丹药系统 (ERC-1155)
/// @notice 8 种丹药：4 种渡劫丹 (筑基丹/结丹丹/凝婴丹/化神丹) + 4 种辅助丹 (培元丹/聚灵丹/洗髓丹/护心丹)
contract Pill is ERC1155, AccessControl, IPill {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public constant PILL_TYPE_COUNT = 8;

    // ── 丹药类型 ID ──
    // 渡劫丹 (0-3): 对应 realm 突破消耗
    uint8 public constant ZHUJI_DAN = 0;      // 筑基丹：练气→筑基
    uint8 public constant JIEDAN_DAN = 1;     // 结丹丹：筑基→金丹
    uint8 public constant NINGYING_DAN = 2;   // 凝婴丹：金丹→元婴
    uint8 public constant HUASHEN_DAN = 3;    // 化神丹：元婴→化神
    // 辅助丹 (4-7)
    uint8 public constant PEIYUAN_DAN = 4;    // 培元丹：经验 +50
    uint8 public constant JULING_DAN = 5;     // 聚灵丹：经验 +200
    uint8 public constant XISUI_DAN = 6;      // 洗髓丹：重置属性点分配
    uint8 public constant HUXIN_DAN = 7;      // 护心丹：渡劫失败保护

    // ── Events ──
    event PillMinted(address indexed to, uint8 pillType, uint256 amount);
    event PillBurned(address indexed from, uint8 pillType, uint256 amount);

    constructor(address admin) ERC1155("") {
        require(admin != address(0), "Pill: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice 铸造丹药（Alchemy/Hunt/SecretRealm/CaveHeaven 等授权合约调用）
    function mint(address to, uint8 pillType, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(pillType < PILL_TYPE_COUNT, "Pill: invalid type");
        require(amount > 0, "Pill: zero amount");
        _mint(to, uint256(pillType), amount, "");
        emit PillMinted(to, pillType, amount);
    }

    /// @notice 销毁丹药（Cultivation/Alchemy 等授权合约调用）
    function burn(address from, uint8 pillType, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(pillType < PILL_TYPE_COUNT, "Pill: invalid type");
        require(amount > 0, "Pill: zero amount");
        _burn(from, uint256(pillType), amount);
        emit PillBurned(from, pillType, amount);
    }

    /// @notice 查询丹药余额
    function balanceOfPill(address player, uint8 pillType) external view returns (uint256) {
        require(pillType < PILL_TYPE_COUNT, "Pill: invalid type");
        return balanceOf(player, uint256(pillType));
    }

    /// @notice 批量查询所有丹药余额
    function getAllPillBalances(address player) external view returns (uint256[8] memory balances) {
        for (uint8 i = 0; i < PILL_TYPE_COUNT; i++) {
            balances[i] = balanceOf(player, uint256(i));
        }
    }

    // ── ERC-1155 + AccessControl 兼容 ──
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
