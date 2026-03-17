import { Bytes } from "@graphprotocol/graph-ts";
import {
  OrderCreated,
  OrderCreated1155,
  OrderCancelled,
  OrderFilled,
  TokenAllowed,
} from "../generated/Market/Market";
import { MarketOrder, AllowedToken } from "../generated/schema";
import { getOrCreatePlayer, getOrCreateProtocolStats, bigIntToBytes } from "./helpers";

export function handleOrderCreated(event: OrderCreated): void {
  let id = bigIntToBytes(event.params.orderId);
  let order = new MarketOrder(id);

  let seller = getOrCreatePlayer(event.params.seller);

  order.orderId = event.params.orderId;
  order.seller = seller.id;
  order.tokenContract = event.params.tokenContract;
  order.tokenId = event.params.tokenId;
  order.price = event.params.price;
  order.isERC1155 = false;
  order.status = "Active";
  order.createdAt = event.block.timestamp;
  order.createdBlock = event.block.number;
  order.save();

  let stats = getOrCreateProtocolStats();
  stats.totalOrders += 1;
  stats.save();
}

export function handleOrderCreated1155(event: OrderCreated1155): void {
  let id = bigIntToBytes(event.params.orderId);
  let order = new MarketOrder(id);

  let seller = getOrCreatePlayer(event.params.seller);

  order.orderId = event.params.orderId;
  order.seller = seller.id;
  order.tokenContract = event.params.tokenContract;
  order.tokenId = event.params.tokenId;
  order.price = event.params.price;
  order.isERC1155 = true;
  order.amount = event.params.amount;
  order.status = "Active";
  order.createdAt = event.block.timestamp;
  order.createdBlock = event.block.number;
  order.save();

  let stats = getOrCreateProtocolStats();
  stats.totalOrders += 1;
  stats.save();
}

export function handleOrderCancelled(event: OrderCancelled): void {
  let id = bigIntToBytes(event.params.orderId);
  let order = MarketOrder.load(id);
  if (order == null) return;

  order.status = "Cancelled";
  order.cancelledAt = event.block.timestamp;
  order.save();
}

export function handleOrderFilled(event: OrderFilled): void {
  let id = bigIntToBytes(event.params.orderId);
  let order = MarketOrder.load(id);
  if (order == null) return;

  order.status = "Filled";
  order.buyer = event.params.buyer;
  order.fee = event.params.fee;
  order.filledAt = event.block.timestamp;
  order.save();

  let stats = getOrCreateProtocolStats();
  stats.totalOrdersFilled += 1;
  stats.save();
}

export function handleTokenAllowed(event: TokenAllowed): void {
  let id = event.params.tokenContract;
  let token = AllowedToken.load(id);
  if (token == null) {
    token = new AllowedToken(id);
  }
  token.allowed = event.params.allowed;
  token.updatedAt = event.block.timestamp;
  token.save();
}
