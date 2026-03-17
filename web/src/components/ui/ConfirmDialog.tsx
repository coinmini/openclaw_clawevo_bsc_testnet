"use client";

interface ConfirmDialogProps {
  readonly title: string;
  readonly description: string;
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  readonly confirmLabel?: string;
  readonly isPending?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  details,
  confirmLabel = "确认",
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0B1015] border border-amber-900/50 rounded-lg shadow-[0_0_30px_rgba(212,175,55,0.2)] w-72 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-amber-50">{title}</h3>
        <p className="text-xs text-amber-100/70">{description}</p>

        {details && details.length > 0 && (
          <div className="space-y-1 bg-black/30 border border-[#6B5A3E]/30 rounded p-2">
            {details.map((d) => (
              <div key={d.label} className="flex justify-between text-xs">
                <span className="text-amber-500/60">{d.label}</span>
                <span className="text-amber-100">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 py-1.5 text-xs rounded border border-[#6B5A3E]/40 text-amber-500/70 hover:text-amber-200 hover:border-amber-500/50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-1.5 text-xs rounded bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/30 transition-colors disabled:opacity-50 disabled:animate-pulse"
          >
            {isPending ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
