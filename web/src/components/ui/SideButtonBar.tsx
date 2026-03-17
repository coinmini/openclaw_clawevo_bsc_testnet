"use client";

import Image from "next/image";

const PANEL_BUTTONS = [
  { key: "leaderboard", icon: "/assets/icons/nav_leaderboard.png", label: "排行榜" },
  { key: "digest",      icon: "/assets/icons/nav_digest.png",      label: "山水日报" },
  { key: "battle",      icon: "/assets/icons/nav_battle.png",      label: "约战" },
  { key: "realm",       icon: "/assets/icons/nav_realm.png",       label: "秘境" },
  { key: "market",      icon: "/assets/icons/nav_market.png",      label: "坊市" },
  { key: "sect",        icon: "/assets/icons/nav_sect.png",        label: "宗门" },
] as const;

/** All panel keys including programmatic-only ones (profile, myPlayer) */
export type PanelKey = (typeof PANEL_BUTTONS)[number]["key"] | "profile" | "myPlayer";

interface SideButtonBarProps {
  readonly activePanel: PanelKey | null;
  readonly onToggle: (key: PanelKey) => void;
}

export function SideButtonBar({ activePanel, onToggle }: SideButtonBarProps) {
  return (
    <div className="flex flex-row gap-0.5">
      {PANEL_BUTTONS.map((btn) => {
        const isActive = activePanel === btn.key;
        return (
          <button
            key={btn.key}
            title={btn.label}
            onClick={() => onToggle(btn.key)}
            className={`relative w-[60px] h-[60px] flex items-center justify-center transition-all cursor-pointer
              ${isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]" : "hover:scale-110 opacity-80 hover:opacity-100"}
            `}
          >
            <Image
              src={btn.icon}
              alt={btn.label}
              width={60}
              height={60}
              className="object-contain"
            />
          </button>
        );
      })}
    </div>
  );
}
