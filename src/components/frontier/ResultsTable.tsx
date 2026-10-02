import { Fragment } from "react";
import {
  fmtLatency,
  fmtLoss,
  lossOf,
  speedup,
  workloadOf,
  type Benchmark,
  type Recipe,
} from "@/data/frontier";
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
  size = "lg",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  size?: "lg" | "sm";
}) {
  return (
    <div className="border-t border-border-strong pt-2">
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "num mt-1 leading-none font-semibold tracking-tight",
          size === "lg" ? "text-[22px]" : "text-[15px]",
        )}
      >
        {value}
      </dd>
      {sub && <div className="num mt-1.5 text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Detail({ bench, r }: { bench: Benchmark; r: Recipe }) {
  const m = r.metrics;
  const isBaseline = r.id === bench.baseline.id;
  const base = bench.baseline.metrics;
  const workload = workloadOf(bench);
  const quality = workload.quality;
  const loss = m[quality.key];
  const vram = (size: "lg" | "sm") => (
    <Tile
      size={size}
      label="Peak VRAM"
      value={m.peakVramGb ? `${m.peakVramGb.toFixed(1)} GB` : DASH}
    />
  );
  const run: [string, React.ReactNode][] = [
    [
      "Engine",
      r.engine.url ? (
        <Ext href={r.engine.url}>{`${r.engine.name} ${r.engine.version}`}</Ext>
      ) : (
        <Num>{`${r.engine.name} ${r.engine.version}`}</Num>
      ),
    ],
  ];
  if (r.configPath)
    run.push(["Config", <Ext href={fileUrl(r.configPath)}>{basename(r.configPath)}</Ext>]);
  if (r.sourceUrl) run.push(["Source", <Ext href={r.sourceUrl}>report</Ext>]);
  if (r.pr) run.push(["Submission", <Ext href={prUrl(r.pr)}>PR #{r.pr}</Ext>]);

  return (
    <div className="space-y-6">
      {/* the numbers the frontier is drawn from */}
      <dl className="grid grid-cols-3 gap-5">
        <Tile
          label="Latency"
          value={fmtLatency(bench, m.latencyS)}
          sub={isBaseline ? "reference" : `${speedup(bench, r).toFixed(1)}× faster than baseline`}
        />
        <Tile
          label={`${quality.name} mean`}
          value={fmtLoss(bench, loss?.mean)}
          sub={isBaseline ? "reference output" : `max ${fmtLoss(bench, loss?.max)} over the set`}
        />
        {workload.imageScores ? (
          <Tile
            label="ImageReward"
            value={m.imageReward ? m.imageReward.mean.toFixed(2) : DASH}
            sub={
              isBaseline
                ? "absolute, prompt vs image"
                : `baseline ${base.imageReward ? base.imageReward.mean.toFixed(2) : DASH}`
            }
          />
        ) : (
          vram("lg")
        )}
      </dl>
      {workload.imageScores && (
        <dl className="grid grid-cols-3 gap-5">
          <Tile
            size="sm"
            label="PSNR"
            value={m.psnr ? `${m.psnr.mean.toFixed(1)} dB` : DASH}
            sub={m.psnr ? `min ${m.psnr.min.toFixed(1)} dB` : undefined}
          />
          <Tile size="sm" label="SSIM" value={m.ssim ? m.ssim.mean.toFixed(3) : DASH} />
          {vram("sm")}
        </dl>
      )}

      <Section title="Recipe">
        {r.optimization.length ? (
          <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-y-1 text-[13px]">
            {r.optimization.map((o, i) => (
              <Fragment key={`${o.technique}-${o.method}-${i}`}>
                <dt className="text-muted-foreground">{o.technique}</dt>
                <dd className="num min-w-0">{o.method}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="text-[13px]">
            <span className="text-muted-foreground">none</span> — the engine's native run
          </p>
        )}
      </Section>

      {r.configuration.length > 0 && (
        <Section title="Configuration">
          <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-muted-foreground sm:columns-2 sm:gap-x-8">
            {r.configuration.map((line) => (
              <li key={line} className="break-inside-avoid [overflow-wrap:anywhere]">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Run">
        <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-y-1 text-[13px]">
          {run.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </Section>
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
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        // Radix would focus the first tabbable element, the close button, and show its
        // ring as soon as the dialog opens. Focus the panel itself instead: Escape and
        // Tab still work from there, and nothing looks pressed.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
      >
        {recipe && (
          <>
            <DialogHeader className="pr-6">
              <DialogTitle className="text-[18px] leading-snug font-semibold tracking-tight">
                {recipe.name}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
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
                <span className="num">measured on {measuredOnText(bench, recipe)}</span>
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
            <th className={cn(th, "text-right")}>{workloadOf(bench).quality.name}</th>
            <th className={cn(th, "text-right")}>Speedup</th>
            <th className={th}>Recipe</th>
            <th className={th}>Engine</th>
            <th className={cn(th, "pr-0")}>Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sel = r.id === selectedId;
            const out = lossOf(bench, r) > limit;
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
                  {fmtLatency(bench, r.metrics.latencyS)}
                </td>
                <td className="num py-2 pr-5 text-right whitespace-nowrap">
                  {fmtLoss(bench, lossOf(bench, r))}
                </td>
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
