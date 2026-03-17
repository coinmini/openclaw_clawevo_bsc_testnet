interface AttributeBarProps {
  readonly name: string;
  readonly value: number;
  readonly max?: number;
}

/** Single attribute progress bar: name | bar | value */
export function AttributeBar({ name, value, max = 999 }: AttributeBarProps) {
  const percent = Math.min((value / max) * 100, 100);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-10 text-amber-500/60 shrink-0">{name}</span>
      <div className="w-24 h-2 bg-gray-700/50 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-amber-500/80 rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-amber-100 font-mono">{value}</span>
    </div>
  );
}
