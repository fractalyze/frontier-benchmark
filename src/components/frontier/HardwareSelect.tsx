import { BENCHMARKS, HARDWARE } from "@/data/frontier";
import { cn } from "@/lib/utils";

/** Native select over the hardware that has data for one model; styled to sit inside text. */
export function HardwareSelect({
  model,
  value,
  onChange,
  className,
}: {
  model: string;
  value: string;
  onChange: (hardware: string) => void;
  className?: string;
}) {
  const hws = HARDWARE.filter((h) =>
    BENCHMARKS.some((b) => b.model === model && b.hardware === h.slug),
  );
  const groups = [...new Set(hws.map((h) => h.group))];
  return (
    <span className="relative inline-block">
      <select
        aria-label="Hardware"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "cursor-pointer appearance-none bg-transparent pr-4 outline-none hover:text-primary focus-visible:underline",
          className,
        )}
      >
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {hws
              .filter((h) => h.group === g)
              .map((h) => (
                <option key={h.slug} value={h.slug}>
                  {h.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-[0.6em] text-muted-foreground"
      >
        ▼
      </span>
    </span>
  );
}
