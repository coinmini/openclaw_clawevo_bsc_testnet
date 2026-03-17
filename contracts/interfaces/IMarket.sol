// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMarket — 坊市交易接口
interface IMarket {
    struct Order {
        address seller;
        address tokenContract;
        uint256 tokenId;
        uint256 price;
        uint256 createdAt;
        bool active;
        bool isERC1155;
        uint256 amount;
    }

    function getOrder(uint256 orderId) external view returns (Order memory);
    function getActiveOrderCount() external view returns (uint256);
    function floorPrices(address tokenContract) external view returns (uint256);
    function managedAccounts(address account) external view returns (bool);
}
