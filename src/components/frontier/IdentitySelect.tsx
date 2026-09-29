import { useNavigate } from "@tanstack/react-router";
import { BENCHMARKS, HARDWARE, MODELS } from "@/data/frontier";

/** Understated native selects that read as part of the title. Only offers combinations with data. */
export function IdentitySelect({ model, hardware }: { model: string; hardware: string }) {
  const navigate = useNavigate();
  const go = (m: string, h: string) => {
    const hit =
      BENCHMARKS.find((b) => b.model === m && b.hardware === h) ??
      BENCHMARKS.find((b) => b.model === m);
    if (hit)
      navigate({ to: "/$model/$hardware", params: { model: hit.model, hardware: hit.hardware } });
  };
  const models = MODELS.filter((m) => BENCHMARKS.some((b) => b.model === m.slug));
  const hws = HARDWARE.filter((h) =>
    BENCHMARKS.some((b) => b.model === model && b.hardware === h.slug),
  );
  const groups = <T extends { group: string }>(xs: T[]) => [...new Set(xs.map((x) => x.group))];
  const sel =
    "cursor-pointer appearance-none bg-transparent pr-5 text-[26px] leading-tight font-semibold tracking-tight outline-none hover:text-primary focus-visible:underline";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-12">
      <label className="block">
        <span className="block text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Model
        </span>
        <span className="relative inline-block">
          <select value={model} onChange={(e) => go(e.target.value, hardware)} className={sel}>
            {groups(models).map((g) => (
              <optgroup key={g} label={g}>
                {models
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-[14px] text-muted-foreground">
            ↓
          </span>
        </span>
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Hardware
        </span>
        <span className="relative inline-block">
          <select value={hardware} onChange={(e) => go(model, e.target.value)} className={sel}>
            {groups(hws).map((g) => (
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
          <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-[14px] text-muted-foreground">
            ↓
          </span>
        </span>
      </label>
    </div>
  );
}
