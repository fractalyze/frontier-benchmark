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

function Detail({ bench, r }: { bench: Benchmark; r: Recipe }) {
  const m = r.metrics;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Group
        title="Optimization"
        rows={
          r.optimization.length
            ? r.optimization.map((o) => [o.technique, <Num>{o.method}</Num>])
            : [[DASH, "none (reference)"]]
        }
      />
      <Group
        title="Benchmark"
        rows={[
          ["Latency", <Num>{m.latencyS.toFixed(1)}s</Num>],
          ["LPIPS mean", <Num>{fmtLpips(m.lpips?.mean)}</Num>],
          ["LPIPS max", <Num>{fmtLpips(m.lpips?.max)}</Num>],
          [
            "PSNR",
            <Num>
              {m.psnr ? `${m.psnr.mean.toFixed(1)} dB (min ${m.psnr.min.toFixed(1)})` : DASH}
            </Num>,
          ],
          ["SSIM", <Num>{m.ssim ? m.ssim.mean.toFixed(3) : DASH}</Num>],
          ["ImageReward", <Num>{m.imageReward ? m.imageReward.mean.toFixed(2) : DASH}</Num>],
          ["Peak VRAM", <Num>{m.peakVramGb ? `${m.peakVramGb.toFixed(1)} GB` : DASH}</Num>],
        ]}
      />
      {r.configuration.length > 0 && (
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Configuration
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
            {r.configuration.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sm:col-span-2">
        <Group
          title="Reproducibility"
          rows={[
            [
              "Config",
              r.configPath ? (
                <Ext href={fileUrl(r.configPath)}>{basename(r.configPath)}</Ext>
              ) : (
                DASH
              ),
            ],
            [
              "Engine",
              r.engine.url ? (
                <Ext href={r.engine.url}>{`${r.engine.name} ${r.engine.version}`}</Ext>
              ) : (
                <Num>{`${r.engine.name} ${r.engine.version}`}</Num>
              ),
            ],
            ["Source", r.sourceUrl ? <Ext href={r.sourceUrl}>report</Ext> : DASH],
            ["Submission", r.pr ? <Ext href={prUrl(r.pr)}>PR #{r.pr}</Ext> : DASH],
            [
              "Status",
              r.status === "Verified"
                ? "Verified"
                : `${r.status} — not yet reproduced by maintainers`,
            ],
            ["Measured on", <Num>{measuredOnText(bench, r)}</Num>],
          ]}
        />
      </div>
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
              <DialogTitle className="text-[18px] font-semibold tracking-tight">
                {recipe.name}
              </DialogTitle>
              <DialogDescription className="num text-[13px]">
                {[
                  `${recipe.metrics.latencyS.toFixed(1)}s`,
                  `${speedup(bench, recipe).toFixed(1)}× faster`,
                  `LPIPS ${fmtLpips(lpipsOf(recipe))}`,
                ].join(" · ")}
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
  const sorted = [...bench.recipes].sort((a, b) => a.metrics.latencyS - b.metrics.latencyS);
  const rows = sorted.filter((r) => lpipsOf(r) <= limit);
  const hidden = sorted.length - rows.length;
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
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="cursor-pointer border-b border-border transition-colors hover:bg-surface-alt"
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
                <td className="num py-2 pr-5 text-[12px] whitespace-nowrap text-muted-foreground">
                  {`${r.engine.name} ${r.engine.version}`}
                </td>
                <td className="py-2 text-[12px]">
                  {r.status === "Verified" ? (
                    "✓"
                  ) : (
                    <span className="text-muted-foreground">{r.status.toLowerCase()}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="num mt-2 pl-4 text-[12px] text-muted-foreground">
          {hidden} {hidden === 1 ? "recipe" : "recipes"} above LPIPS {fmtLpips(limit)} hidden —
          raise the limit on the chart to see {hidden === 1 ? "it" : "them"}.
        </p>
      )}
      <RecipeDialog bench={bench} recipe={open} onClose={onClose} />
    </div>
  );
}
