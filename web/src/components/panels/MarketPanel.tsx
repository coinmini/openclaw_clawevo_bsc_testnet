"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useMarketOrders, type MarketOrder, type NftType } from "@/data/hooks/useMarketOrders";
import { useFillOrder, useCancelOrder } from "@/data/hooks/useMarketActions";
import { truncateAddress, formatLS, timeAgo } from "@/lib/formatting";
import { CONTRACTS } from "@/lib/contracts";

/* ---------- Constants ---------- */

const QUALITY_NAMES = ["白", "绿", "蓝", "紫"] as const;
const QUALITY_COLORS = [
  "text-gray-400",
  "text-green-400",
  "text-blue-400",
  "text-purple-400",
] as const;
const EQUIPMENT_TYPES = ["武器", "护甲"] as const;

const PILL_NAMES = [
  "筑基丹", "结丹丹", "凝婴丹", "化神丹",
  "培元丹", "聚灵丹", "洗髓丹", "护心丹",
] as const;

/* ---------- Tab type ---------- */

type TabKey = "all" | "equipment" | "beast" | "pill";

/* ---------- Helpers ---------- */

function nftTypeLabel(t: NftType): string {
  if (t === "equipment") return "装备";
  if (t === "beast") return "灵兽";
  if (t === "pill") return "丹药";
  return "未知";
}

function nftTypeColor(t: NftType): string {
  if (t === "equipment") return "text-xianxia-gold";
  if (t === "beast") return "text-xianxia-jade";
  if (t === "pill") return "text-emerald-400";
  return "text-gray-400";
}

function pillName(tokenId: bigint): string {
  const idx = Number(tokenId);
  return idx >= 0 && idx < PILL_NAMES.length ? PILL_NAMES[idx] : `丹药#${idx}`;
}

/* ---------- Order Card ---------- */

function OrderCard({
  order,
  isOwn,
  onBuy,
  onCancel,
  buyPending,
  cancelPending,
}: {
  readonly order: MarketOrder;
  readonly isOwn: boolean;
  readonly onBuy: () => void;
  readonly onCancel: () => void;
  readonly buyPending: boolean;
  readonly cancelPending: boolean;
}) {
  return (
    <div className="bg-black/30 border border-xianxia-gold/40 rounded px-2 py-1.5 space-y-1 hover:border-xianxia-gold hover:shadow-[0_0_8px_rgba(212,175,55,0.2)] transition-all">
      {/* Row 1: Type + Token ID/Name + Price */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${nftTypeColor(order.nftType)}`}>
            {nftTypeLabel(order.nftType)}
          </span>
          {order.isERC1155 ? (
            <span className="text-xs text-gray-400">
              {pillName(order.tokenId)}
              {order.amount != null && (
                <span className="ml-1 text-emerald-400/80">x{order.amount.toString()}</span>
              )}
            </span>
          ) : (
            <span className="text-xs text-gray-500">#{order.tokenId.toString()}</span>
          )}
        </div>
        <span className="text-xs font-bold text-xianxia-gold drop-shadow-sm">
          {formatLS(order.price)} LS
        </span>
      </div>

      {/* Row 2: Seller + Time + Action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {truncateAddress(order.seller)}
          </span>
          <span className="text-[10px] text-gray-600">
            {timeAgo(order.createdAt)}
          </span>
        </div>
        {isOwn ? (
          <button
            onClick={onCancel}
            disabled={cancelPending}
            className="text-[10px] px-2 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-800/60 disabled:opacity-50"
          >
            {cancelPending ? "..." : "撤单"}
          </button>
        ) : (
          <button
            onClick={onBuy}
            disabled={buyPending}
            className="text-[10px] px-2 py-0.5 rounded border border-xianxia-gold bg-amber-900/40 text-xianxia-parchment hover:bg-amber-800/60 disabled:opacity-50 transition-colors"
          >
            {buyPending ? "..." : "购买"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Tab labels ---------- */

const TAB_LABELS: Record<TabKey, string> = {
  all: "全部",
  equipment: "装备",
  beast: "灵兽",
  pill: "丹药",
};

/* ---------- Main Panel ---------- */

export function MarketPanel() {
  const { address } = useAccount();
  const { data: orders, isLoading } = useMarketOrders();
  const { fill, isPending: buyPending } = useFillOrder();
  const { cancel, isPending: cancelPending } = useCancelOrder();

  const [tab, setTab] = useState<TabKey>("all");
  const [buyingId, setBuyingId] = useState<bigint | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);

  const filtered = (orders ?? []).filter((o) => {
    if (tab === "all") return true;
    return o.nftType === tab;
  });

  const myOrders = filtered.filter(
    (o) => address && o.seller.toLowerCase() === address.toLowerCase()
  );
  const otherOrders = filtered.filter(
    (o) => !address || o.seller.toLowerCase() !== address.toLowerCase()
  );

  const handleBuy = (order: MarketOrder) => {
    setBuyingId(order.orderId);
    fill(order.orderId);
  };

  const handleCancel = (order: MarketOrder) => {
    setCancellingId(order.orderId);
    cancel(order.orderId);
  };

  return (
    <div className="space-y-2">
      {/* Tab bar */}
      <div className="flex gap-1">
        {(["all", "equipment", "beast", "pill"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              tab === t
                ? "bg-xianxia-slate text-xianxia-gold border border-xianxia-gold shadow-[0_0_5px_rgba(212,175,55,0.3)] animate-glow-amber"
                : "bg-black/20 text-gray-500 border border-transparent hover:text-xianxia-parchment"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-600">
          {filtered.length} 件
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <p className="text-xs text-gray-500 animate-pulse">加载中...</p>
      )}

      {/* Orders list */}
      {!isLoading && filtered.length === 0 && (
        <p className="text-xs text-gray-600">暂无挂单</p>
      )}

      {otherOrders.length > 0 && (
        <div className="max-h-[50vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
          {otherOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              isOwn={false}
              onBuy={() => handleBuy(o)}
              onCancel={() => {}}
              buyPending={buyPending && buyingId === o.orderId}
              cancelPending={false}
            />
          ))}
        </div>
      )}

      {/* My orders */}
      {myOrders.length > 0 && (
        <>
          <div className="text-[10px] text-emerald-400/60 font-bold tracking-wider mt-1">
            我的挂单
          </div>
          <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
            {myOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                isOwn={true}
                onBuy={() => {}}
                onCancel={() => handleCancel(o)}
                buyPending={false}
                cancelPending={cancelPending && cancellingId === o.orderId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
