"use client";

import { useState, useCallback } from "react";
import { usePlayerEquipment, type EquipmentItem } from "@/data/hooks/usePlayerEquipment";
import {
  useEquipItem,
  useUnequipItem,
  useEnhanceItem,
  useStartUpgrade,
  useFinishUpgrade,
  useDecomposeItem,
} from "@/data/hooks/useEquipmentActions";
import { EquipmentCard } from "./EquipmentCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  QUALITY_NAMES,
  QUALITY_COLORS,
  EQUIPMENT_TYPE_NAMES,
  ENHANCE_COSTS,
  UPGRADE_COSTS,
  UPGRADE_RATES,
  DECOMPOSE_LS,
  DECOMPOSE_MATERIALS,
  MAX_ENHANCE_LEVEL,
  formatBonusBP,
} from "@/lib/equipment-constants";
import { formatLS } from "@/lib/formatting";

type SubView = "equipped" | "inventory" | "enhance" | "upgrade" | "decompose";

const SUB_TABS: readonly { readonly key: SubView; readonly label: string }[] = [
  { key: "equipped", label: "已装备" },
  { key: "inventory", label: "背包" },
  { key: "enhance", label: "强化" },
  { key: "upgrade", label: "升品" },
  { key: "decompose", label: "分解" },
];

interface Props {
  readonly playerAddress?: string;
}

export function EquipmentTabContent({ playerAddress }: Props) {
  const {
    equipped,
    inventory,
    items,
    equippedWeaponId,
    equippedArmorId,
    spiritMaterials,
    isLoading,
  } = usePlayerEquipment(playerAddress);

  const [subView, setSubView] = useState<SubView>("equipped");
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [upgradeMaterials, setUpgradeMaterials] = useState<bigint[]>([]);
  const [showConfirm, setShowConfirm] = useState<{
    type: "decompose" | "upgrade";
    item?: EquipmentItem;
  } | null>(null);

  const equipAction = useEquipItem();
  const unequipAction = useUnequipItem();
  const enhanceAction = useEnhanceItem();
  const startUpgradeAction = useStartUpgrade();
  const finishUpgradeAction = useFinishUpgrade();
  const decomposeAction = useDecomposeItem();

  const selectedItem = items.find((i) => i.tokenId === selectedId) ?? null;

  const handleSelect = useCallback((tokenId: bigint) => {
    setSelectedId((prev) => (prev === tokenId ? null : tokenId));
  }, []);

  const handleToggleUpgradeMaterial = useCallback((tokenId: bigint) => {
    setUpgradeMaterials((prev) =>
      prev.includes(tokenId)
        ? prev.filter((id) => id !== tokenId)
        : prev.length < 3
          ? [...prev, tokenId]
          : prev,
    );
  }, []);

  if (isLoading) {
    return (
      <div className="text-xs text-amber-100/60 animate-pulse mt-2">
        加载装备数据...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-xs text-amber-500/50 italic mt-2">
        暂无装备
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap border-b border-white/5 pb-1 px-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setSubView(tab.key);
              setSelectedId(null);
              setUpgradeMaterials([]);
            }}
            className={`px-3 py-1.5 text-sm font-medium tracking-wide transition-colors relative ${
              subView === tab.key
                ? "text-xianxia-gold"
                : "text-amber-500/40 hover:text-amber-200"
            }`}
          >
            {tab.label}
            {subView === tab.key && (
              <span className="absolute left-0 -bottom-[5px] w-full h-[1px] bg-gradient-to-r from-transparent via-xianxia-gold to-transparent" />
            )}
          </button>
        ))}
      </div>

      {/* Spirit materials display */}
      <div className="text-xs text-amber-500/60">
        灵材: <span className="text-amber-100">{spiritMaterials.toString()}</span>
      </div>

      {/* Sub-view content */}
      {subView === "equipped" && (
        <EquippedView
          equipped={equipped}
          weaponId={equippedWeaponId}
          armorId={equippedArmorId}
          onUnequip={(slot) => unequipAction.execute(slot)}
          isPending={unequipAction.isPending || unequipAction.isConfirming}
        />
      )}

      {subView === "inventory" && (
        <InventoryView
          inventory={inventory}
          selectedId={selectedId}
          onSelect={handleSelect}
          onEquip={(tokenId) => equipAction.execute(tokenId)}
          isPending={equipAction.isPending || equipAction.isConfirming}
        />
      )}

      {subView === "enhance" && (
        <EnhanceView
          items={items}
          selectedItem={selectedItem}
          onSelect={handleSelect}
          onEnhance={(item) => {
            enhanceAction.execute(item.tokenId, item.enhanceLevel);
          }}
          onConfirmEnhance={(item) => {
            enhanceAction.confirmEnhance(item.tokenId);
          }}
          step={enhanceAction.step}
          isPending={enhanceAction.isPending || enhanceAction.isConfirming}
        />
      )}

      {subView === "upgrade" && (
        <UpgradeView
          inventory={inventory}
          materials={upgradeMaterials}
          onToggleMaterial={handleToggleUpgradeMaterial}
          onStartUpgrade={(quality) => {
            setShowConfirm({ type: "upgrade" });
            startUpgradeAction.execute(upgradeMaterials, quality);
          }}
          onFinishUpgrade={() => finishUpgradeAction.execute()}
          isPending={
            startUpgradeAction.isPending ||
            startUpgradeAction.isConfirming ||
            finishUpgradeAction.isPending ||
            finishUpgradeAction.isConfirming
          }
        />
      )}

      {subView === "decompose" && (
        <DecomposeView
          items={items.filter((i) => !i.isEquipped)}
          selectedItem={selectedItem}
          onSelect={handleSelect}
          onDecompose={(item) =>
            setShowConfirm({ type: "decompose", item })
          }
        />
      )}

      {/* Confirm dialog for decompose */}
      {showConfirm?.type === "decompose" && showConfirm.item && (
        <ConfirmDialog
          title="确认分解"
          description={`分解 ${QUALITY_NAMES[showConfirm.item.quality]} ${EQUIPMENT_TYPE_NAMES[showConfirm.item.equipmentType]}？此操作不可逆。`}
          details={[
            {
              label: "返还灵石",
              value: `${DECOMPOSE_LS[showConfirm.item.quality]} LS`,
            },
            {
              label: "返还灵材",
              value: `${DECOMPOSE_MATERIALS[showConfirm.item.quality]}`,
            },
          ]}
          confirmLabel="分解"
          isPending={decomposeAction.isPending || decomposeAction.isConfirming}
          onConfirm={() => {
            if (showConfirm.item) {
              decomposeAction.execute(showConfirm.item.tokenId);
            }
            setShowConfirm(null);
          }}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}

/* ---------- Equipped View ---------- */

function EquippedView({
  equipped,
  weaponId,
  armorId,
  onUnequip,
  isPending,
}: {
  equipped: readonly EquipmentItem[];
  weaponId: bigint;
  armorId: bigint;
  onUnequip: (slot: number) => void;
  isPending: boolean;
}) {
  const weapon = equipped.find((e) => e.equipmentType === 0);
  const armor = equipped.find((e) => e.equipmentType === 1);

  return (
    <div className="grid grid-cols-2 gap-2">
      <SlotDisplay
        label="法宝"
        item={weapon}
        onUnequip={() => onUnequip(0)}
        isPending={isPending}
      />
      <SlotDisplay
        label="护宝"
        item={armor}
        onUnequip={() => onUnequip(1)}
        isPending={isPending}
      />
    </div>
  );
}

function SlotDisplay({
  label,
  item,
  onUnequip,
  isPending,
}: {
  label: string;
  item: EquipmentItem | undefined;
  onUnequip: () => void;
  isPending: boolean;
}) {
  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 p-3 min-h-[100px]">
        <span className="text-[11px] text-amber-500/40 mb-1">{label}</span>
        <span className="text-[10px] text-amber-500/20">空</span>
      </div>
    );
  }

  const q = item.quality;
  const borderColor = QUALITY_COLORS.border[q] ?? "#9CA3AF";
  const textClass = QUALITY_COLORS.text[q] ?? "text-gray-400";
  const bgClass = QUALITY_COLORS.bg[q] ?? "bg-gray-500/20";

  return (
    <div
      className={`flex flex-col items-center rounded-lg border p-2 min-h-[100px] ${bgClass}`}
      style={{ borderColor }}
    >
      <span className="text-[10px] text-amber-500/50 mb-1">{label}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${textClass} bg-black/30`}>
        {QUALITY_NAMES[q]}
      </span>
      <span className="text-sm font-mono text-amber-50 mt-1">
        {formatBonusBP(item.bonusBP)}
      </span>
      {item.enhanceLevel > 0 && (
        <span className="text-[10px] text-yellow-400 mt-0.5">+{item.enhanceLevel}</span>
      )}
      <button
        onClick={onUnequip}
        disabled={isPending}
        className="mt-auto text-[9px] px-1.5 py-0.5 rounded border border-red-900/40 text-red-400/60 hover:text-red-300 hover:border-red-500/50 transition-colors disabled:opacity-50"
      >
        卸下
      </button>
    </div>
  );
}

/* ---------- Inventory View ---------- */

const INVENTORY_SLOTS = 18; // 3 rows × 6 cols
const TYPE_SHORT = ["法", "护"] as const;

function InventoryView({
  inventory,
  selectedId,
  onSelect,
  onEquip,
  isPending,
}: {
  inventory: readonly EquipmentItem[];
  selectedId: bigint | null;
  onSelect: (tokenId: bigint) => void;
  onEquip: (tokenId: bigint) => void;
  isPending: boolean;
}) {
  const selectedItem = inventory.find((i) => i.tokenId === selectedId) ?? null;

  // Build fixed-size slot array
  const slots: (EquipmentItem | null)[] = Array.from(
    { length: Math.max(INVENTORY_SLOTS, inventory.length) },
    (_, i) => inventory[i] ?? null,
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1">
        {slots.map((item, i) => {
          if (!item) {
            return (
              <div
                key={`empty-${i}`}
                className="aspect-square rounded border border-dashed border-white/10 bg-black/20"
              />
            );
          }
          const q = item.quality;
          const borderColor = QUALITY_COLORS.border[q] ?? "#9CA3AF";
          const isSelected = item.tokenId === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.tokenId)}
              className={`aspect-square rounded border flex flex-col items-center justify-center p-0.5 transition-all ${
                QUALITY_COLORS.bg[q]
              } ${
                isSelected
                  ? `ring-2 ring-offset-1 ring-offset-[#0B1015] ${QUALITY_COLORS.glow[q]}`
                  : "hover:brightness-125"
              }`}
              style={{ borderColor }}
            >
              <span className={`text-xs font-bold ${QUALITY_COLORS.text[q]}`}>
                {TYPE_SHORT[item.equipmentType] ?? "?"}
              </span>
              <span className="text-[9px] text-amber-100 font-mono mt-0.5">
                {formatBonusBP(item.bonusBP)}
              </span>
              {item.enhanceLevel > 0 && (
                <span className="text-[8px] text-yellow-400">+{item.enhanceLevel}</span>
              )}
              <span className={`text-[8px] ${QUALITY_COLORS.text[q]}`}>
                {QUALITY_NAMES[q]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected item detail */}
      {selectedItem && (
        <div className="flex items-center gap-3 p-2 bg-black/30 border border-white/10 rounded-lg">
          <div className="flex-1 text-xs text-amber-100">
            <span className={QUALITY_COLORS.text[selectedItem.quality]}>
              {QUALITY_NAMES[selectedItem.quality]}
            </span>
            {" "}
            {EQUIPMENT_TYPE_NAMES[selectedItem.equipmentType]}
            {selectedItem.enhanceLevel > 0 && (
              <span className="text-yellow-400 ml-1">+{selectedItem.enhanceLevel}</span>
            )}
            <span className="text-amber-500/50 ml-2 font-mono">
              {formatBonusBP(selectedItem.bonusBP)}
            </span>
          </div>
          <button
            onClick={() => onEquip(selectedId!)}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium tracking-widest rounded bg-emerald-900/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
          >
            {isPending ? "祭炼中..." : "祭炼"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Enhance View ---------- */

function EnhanceView({
  items,
  selectedItem,
  onSelect,
  onEnhance,
  onConfirmEnhance,
  step,
  isPending,
}: {
  items: readonly EquipmentItem[];
  selectedItem: EquipmentItem | null;
  onSelect: (tokenId: bigint) => void;
  onEnhance: (item: EquipmentItem) => void;
  onConfirmEnhance: (item: EquipmentItem) => void;
  step: string;
  isPending: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
        {items.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            selected={item.tokenId === selectedItem?.tokenId}
            onClick={() => onSelect(item.tokenId)}
          />
        ))}
      </div>

      {selectedItem && (
        <div className="pt-3 border-t border-white/[0.03] space-y-2 mt-2">
          <div className="text-xs text-amber-100/90 flex justify-between px-1">
            <span>当前境界:</span>
            <span className="text-xianxia-gold">+{selectedItem.enhanceLevel}</span>
          </div>
          {selectedItem.enhanceLevel < MAX_ENHANCE_LEVEL ? (
            <>
              <div className="text-[11px] text-amber-500/40 px-1 font-mono">
                灵石消耗: {ENHANCE_COSTS[selectedItem.enhanceLevel]} LS
              </div>
              {step === "approving" ? (
                <button
                  onClick={() => onConfirmEnhance(selectedItem)}
                  disabled={isPending}
                  className="w-full mt-1 py-2 text-xs font-medium tracking-widest rounded bg-xianxia-gold/10 border border-xianxia-gold/20 text-xianxia-gold hover:bg-xianxia-gold/20 transition-colors disabled:opacity-50"
                >
                  {isPending ? "道法共鸣中..." : "确认精炼"}
                </button>
              ) : (
                <button
                  onClick={() => onEnhance(selectedItem)}
                  disabled={isPending}
                  className="w-full mt-1 py-2 text-xs font-medium tracking-widest rounded bg-xianxia-gold/10 border border-xianxia-gold/20 text-xianxia-gold hover:bg-xianxia-gold/20 transition-colors disabled:opacity-50"
                >
                  {isPending ? "淬炼中..." : `淬炼法宝 → +${selectedItem.enhanceLevel + 1}`}
                </button>
              )}
            </>
          ) : (
            <div className="text-[11px] text-emerald-400/80 px-1 py-1">道蕴已满，不可再进阶</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Upgrade View ---------- */

function UpgradeView({
  inventory,
  materials,
  onToggleMaterial,
  onStartUpgrade,
  onFinishUpgrade,
  isPending,
}: {
  inventory: readonly EquipmentItem[];
  materials: bigint[];
  onToggleMaterial: (tokenId: bigint) => void;
  onStartUpgrade: (quality: number) => void;
  onFinishUpgrade: () => void;
  isPending: boolean;
}) {
  // Group by quality for material selection
  const firstMaterial = inventory.find((i) => materials.includes(i.tokenId));
  const targetQuality = firstMaterial ? firstMaterial.quality : null;
  const eligibleItems =
    targetQuality !== null
      ? inventory.filter((i) => i.quality === targetQuality)
      : inventory;

  return (
    <div className="space-y-2">
      <div className="text-xs text-amber-500/60">
        选择3件同品质装备作为材料:
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
        {eligibleItems.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            selected={materials.includes(item.tokenId)}
            onClick={() => onToggleMaterial(item.tokenId)}
          />
        ))}
      </div>

      {materials.length === 3 && targetQuality !== null && targetQuality < 3 && (
        <div className="pt-3 border-t border-white/[0.03] space-y-2 mt-2">
          <div className="text-xs text-amber-100/90 flex justify-between px-1">
            <span>品阶提升:</span>
            <span>
              <span className="text-amber-500/50">{QUALITY_NAMES[targetQuality]}</span>
              <span className="text-amber-500/40 mx-1">→</span>
              <span className="text-cyan-400">{QUALITY_NAMES[targetQuality + 1]}</span>
            </span>
          </div>
          <div className="text-[11px] text-amber-500/40 px-1 font-mono flex justify-between">
            <span>灵石消耗: {UPGRADE_COSTS[targetQuality]} LS</span>
            <span>成功率: <span className="text-emerald-400/80">{UPGRADE_RATES[targetQuality]}%</span></span>
          </div>
          <button
            onClick={() => onStartUpgrade(targetQuality)}
            disabled={isPending}
            className="w-full mt-1 py-2 text-xs font-medium tracking-widest rounded bg-cyan-900/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-900/20 transition-colors disabled:opacity-50"
          >
            {isPending ? "逆天改命中..." : "开始升品"}
          </button>
        </div>
      )}

      <button
        onClick={onFinishUpgrade}
        disabled={isPending}
        className="w-full py-1.5 text-[10px] rounded text-amber-500/40 hover:text-amber-300 transition-colors disabled:opacity-50 underline decoration-white/10 underline-offset-4"
      >
        完成升阶（需等待天地法则交织1区块）
      </button>
    </div>
  );
}

/* ---------- Decompose View ---------- */

function DecomposeView({
  items,
  selectedItem,
  onSelect,
  onDecompose,
}: {
  items: readonly EquipmentItem[];
  selectedItem: EquipmentItem | null;
  onSelect: (tokenId: bigint) => void;
  onDecompose: (item: EquipmentItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-amber-500/50 italic">无可分解装备</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
        {items.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            selected={item.tokenId === selectedItem?.tokenId}
            onClick={() => onSelect(item.tokenId)}
          />
        ))}
      </div>

      {selectedItem && (
        <div className="pt-3 border-t border-white/[0.03] space-y-2 mt-2 px-1">
          <div className="text-xs text-amber-100/90 flex justify-between">
            <span>目标法宝:</span>
            <span className="text-red-300/80">
              {QUALITY_NAMES[selectedItem.quality]}{" "}
              {EQUIPMENT_TYPE_NAMES[selectedItem.equipmentType]}
              {selectedItem.enhanceLevel > 0 && ` +${selectedItem.enhanceLevel}`}
            </span>
          </div>
          <div className="text-[11px] text-amber-500/40 font-mono">
            返魂: <span className="text-xianxia-gold">+{DECOMPOSE_LS[selectedItem.quality]} LS</span> , <span className="text-xianxia-jade">+{DECOMPOSE_MATERIALS[selectedItem.quality]} 灵材</span>
          </div>
          <button
            onClick={() => onDecompose(selectedItem)}
            className="w-full mt-1 py-1.5 text-xs font-medium tracking-widest rounded bg-red-900/10 border border-red-500/20 text-red-400/80 hover:bg-red-900/20 hover:text-red-300 transition-colors"
          >
            散去灵力 (分解)
          </button>
        </div>
      )}
    </div>
  );
}
