"use client";

import { useEffect, useCallback, type ReactNode } from "react";

interface GameModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly size?: "md" | "lg" | "xl";
  readonly children: ReactNode;
}

export function GameModal({ open, onClose, title, size = "md", children }: GameModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const maxW = size === "xl" ? "max-w-[900px]" : size === "lg" ? "max-w-[720px]" : "max-w-[520px]";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`${maxW} w-[90vw] max-h-[80vh] flex flex-col bg-xianxia-dark border border-xianxia-gold rounded-xl shadow-[0_0_30px_rgba(212,175,55,0.2)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-xianxia-gold">
          <h2 className="text-sm font-bold tracking-wider text-xianxia-gold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-amber-500/50 hover:text-amber-200 text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
