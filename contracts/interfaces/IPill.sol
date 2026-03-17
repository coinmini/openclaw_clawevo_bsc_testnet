// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPill — 丹药系统接口 (ERC-1155)
interface IPill {
    /// @notice 铸造丹药（授权合约调用）
    function mint(address to, uint8 pillType, uint256 amount) external;

    /// @notice 销毁丹药（授权合约调用）
    function burn(address from, uint8 pillType, uint256 amount) external;

    /// @notice 查询丹药余额
    function balanceOfPill(address player, uint8 pillType) external view returns (uint256);

    /// @notice 丹药类型总数
    function PILL_TYPE_COUNT() external view returns (uint8);
}
