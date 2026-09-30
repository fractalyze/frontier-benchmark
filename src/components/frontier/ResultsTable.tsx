import { Fragment } from "react";
import { fmtLpips, lpipsOf, speedup, type Benchmark, type Recipe } from "@/data/frontier";
import { fileUrl, prUrl } from "@/data/site";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DASH = "—";

/** e.g. "held-out set, 100 prompts, 2026-09-21". */
const measuredOnText = (bench: Benchmark, r: Recipe) => {
  const set = bench.promptSets[r.measuredOn];
  return set
    ? `${set.name} (${set.count} prompt/seed pairs), ${r.date}`
    : `${r.measuredOn}, ${r.date}`;
};

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function Group({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </div>
      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-y-1 text-[13px]">
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="num text-primary hover:underline">
    {children} ↗
  </a>
);

const Num = ({ children }: { children: React.ReactNode }) => (
  <span className="num">{children}</span>
);

/** One headline number with a small caption underneath. */
function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="border-t border-border-strong pt-2">
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="num mt-1 text-[22px] leading-none font-semibold tracking-tight">{value}</dd>
      {sub && <div className="num mt-1.5 text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Detail({ bench, r }: { bench: Benchmark; r: Recipe }) {
  const m = r.metrics;
  const isBaseline = r.id === bench.baseline.id;
  const base = bench.baseline.metrics;
  return (
    <div className="space-y-7">
      {/* the three numbers the frontier is drawn from */}
      <dl className="grid grid-cols-3 gap-5">
        <Tile
          label="Latency"
          value={`${m.latencyS.toFixed(1)}s`}
          sub={isBaseline ? "reference" : `${speedup(bench, r).toFixed(1)}× faster than baseline`}
        />
        <Tile
          label="LPIPS mean"
          value={fmtLpips(m.lpips?.mean)}
          sub={isBaseline ? "reference images" : `max ${fmtLpips(m.lpips?.max)} over the set`}
        />
        <Tile
          label="ImageReward"
          value={m.imageReward ? m.imageReward.mean.toFixed(2) : DASH}
          sub={
            isBaseline
              ? "absolute, prompt vs image"
              : `baseline ${base.imageReward ? base.imageReward.mean.toFixed(2) : DASH}`
          }
        />
      </dl>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Recipe
          </div>
          {r.optimization.length ? (
            <ul className="space-y-1 text-[13px]">
              {r.optimization.map((o) => (
                <li key={`${o.technique}-${o.method}`} className="flex gap-2">
                  <span className="w-[130px] shrink-0 text-muted-foreground">{o.technique}</span>
                  <Num>{o.method}</Num>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px]">
              <span className="text-muted-foreground">none</span> — the engine's native run
            </p>
          )}
          {r.configuration.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[12px] text-muted-foreground">
              {r.configuration.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <Group
          title="Against the baseline"
          rows={[
            ["LPIPS max", <Num>{fmtLpips(m.lpips?.max)}</Num>],
            ["PSNR", <Num>{m.psnr ? `${m.psnr.mean.toFixed(1)} dB` : DASH}</Num>],
            ["PSNR min", <Num>{m.psnr ? `${m.psnr.min.toFixed(1)} dB` : DASH}</Num>],
            ["SSIM", <Num>{m.ssim ? m.ssim.mean.toFixed(3) : DASH}</Num>],
            ["Peak VRAM", <Num>{m.peakVramGb ? `${m.peakVramGb.toFixed(1)} GB` : DASH}</Num>],
          ]}
        />
      </div>

      <Group
        title="Run"
        rows={[
          ["Measured on", <Num>{measuredOnText(bench, r)}</Num>],
          [
            "Engine",
            r.engine.url ? (
              <Ext href={r.engine.url}>{`${r.engine.name} ${r.engine.version}`}</Ext>
            ) : (
              <Num>{`${r.engine.name} ${r.engine.version}`}</Num>
            ),
          ],
          [
            "Config",
            r.configPath ? <Ext href={fileUrl(r.configPath)}>{basename(r.configPath)}</Ext> : DASH,
          ],
          ["Source", r.sourceUrl ? <Ext href={r.sourceUrl}>report</Ext> : DASH],
          ["Submission", r.pr ? <Ext href={prUrl(r.pr)}>PR #{r.pr}</Ext> : DASH],
        ]}
      />
    </div>
  );
}

/** The detail of one recipe, as a modal so the table underneath keeps its layout. */
export function RecipeDialog({
  bench,
  recipe,
  onClose,
}: {
  bench: Benchmark;
  recipe: Recipe | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {recipe && (
          <>
            <DialogHeader className="pr-6">
              <DialogTitle className="flex flex-wrap items-center gap-3 text-[20px] font-semibold tracking-tight">
                {recipe.name}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wider uppercase",
                    recipe.status === "Verified"
                      ? "bg-verified/12 text-verified"
                      : "bg-surface-alt text-muted-foreground",
                  )}
                >
                  {recipe.status}
                </span>
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground">
                {recipe.status === "Verified"
                  ? "Re-measured by the maintainers on the private held-out set."
                  : `${recipe.status} — not yet reproduced by the maintainers.`}
              </DialogDescription>
            </DialogHeader>
            <Detail bench={bench} r={recipe} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ResultsTable({
  bench,
  limit,
  selectedId,
  openId,
  onSelect,
  onClose,
}: {
  bench: Benchmark;
  limit: number;
  selectedId: string | null;
  /** Recipe whose detail dialog is open. */
  openId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const rows = [...bench.recipes].sort((a, b) => a.metrics.latencyS - b.metrics.latencyS);
  const open = bench.recipes.find((r) => r.id === openId) ?? null;
  const th = "py-2 pr-5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th className={cn(th, "pl-4 text-right")}>Latency</th>
            <th className={cn(th, "text-right")}>LPIPS</th>
            <th className={cn(th, "text-right")}>Speedup</th>
            <th className={th}>Recipe</th>
            <th className={th}>Engine</th>
            <th className={cn(th, "pr-0")}>Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sel = r.id === selectedId;
            const out = lpipsOf(r) > limit;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                data-within-limit={!out}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors hover:bg-surface-alt",
                  out && "text-muted-foreground/45",
                )}
              >
                <td
                  className={cn(
                    "num py-2 pr-5 pl-4 text-right",
                    sel ? "shadow-[inset_2px_0_0_var(--primary)]" : "",
                  )}
                >
                  {r.metrics.latencyS.toFixed(1)}s
                </td>
                <td className="num py-2 pr-5 text-right">{fmtLpips(lpipsOf(r))}</td>
                <td className="num py-2 pr-5 text-right">{speedup(bench, r).toFixed(1)}×</td>
                <td className={cn("py-2 pr-5", sel ? "font-semibold" : "font-medium")}>{r.name}</td>
                <td
                  className={cn(
                    "num py-2 pr-5 text-[12px] whitespace-nowrap",
                    !out && "text-muted-foreground",
                  )}
                >
                  {`${r.engine.name} ${r.engine.version}`}
                </td>
                <td className="py-2 text-[12px]">
                  {r.status === "Verified" ? (
                    "✓"
                  ) : (
                    <span className={cn(!out && "text-muted-foreground")}>
                      {r.status.toLowerCase()}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <RecipeDialog bench={bench} recipe={open} onClose={onClose} />
    </div>
  );
}
