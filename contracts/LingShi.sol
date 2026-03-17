// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ILingShi.sol";

/// @title LingShi — 灵石 ERC-20 代币
/// @notice 游戏经济核心代币，初始供应量为 0，全部通过游戏活动产出
contract LingShi is ERC20, AccessControl, ILingShi {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(address admin) ERC20("LingShi", "LS") {
        require(admin != address(0), "LingShi: zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice 铸造灵石（仅 MINTER_ROLE，如 Register / Cultivation 等合约）
    function mint(address to, uint256 amount) external override onlyRole(MINTER_ROLE) {
        require(to != address(0), "LingShi: mint to zero");
        require(amount > 0, "LingShi: zero amount");
        _mint(to, amount);
    }

    /// @notice 销毁灵石（仅 BURNER_ROLE，如 Treasury）
    function burn(address from, uint256 amount) external override onlyRole(BURNER_ROLE) {
        require(from != address(0), "LingShi: burn from zero");
        require(amount > 0, "LingShi: zero amount");
        _burn(from, amount);
    }

    /// @dev 解决 IERC20 在 ERC20 和 ILingShi 中的继承冲突
    function totalSupply() public view override(ERC20, IERC20) returns (uint256) {
        return super.totalSupply();
    }

    function balanceOf(address account) public view override(ERC20, IERC20) returns (uint256) {
        return super.balanceOf(account);
    }

    function transfer(address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        return super.transfer(to, value);
    }

    function allowance(address owner, address spender) public view override(ERC20, IERC20) returns (uint256) {
        return super.allowance(owner, spender);
    }

    function approve(address spender, uint256 value) public override(ERC20, IERC20) returns (bool) {
        return super.approve(spender, value);
    }

    function transferFrom(address from, address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        return super.transferFrom(from, to, value);
    }
}
