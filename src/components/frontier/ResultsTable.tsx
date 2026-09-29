import { Fragment, useEffect, useRef } from "react";
import { fmtLpips, lpipsOf, speedup, type Benchmark, type Recipe } from "@/data/frontier";
import { commitUrl, fileUrl, prUrl } from "@/data/site";
import { cn } from "@/lib/utils";

const DASH = "—";

/** e.g. "held-out set, 100 prompts, 2026-09-21". */
const measuredOnText = (bench: Benchmark, r: Recipe) =>
  `${r.measuredOn} set, ${bench.promptSets[r.measuredOn].count} prompts, ${r.date}`;

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
    <div className="grid gap-6 py-4 pr-2 pl-5 md:grid-cols-3">
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
          ["Throughput", <Num>{m.throughputImgS.toFixed(2)} img/s</Num>],
          ["LPIPS mean", <Num>{fmtLpips(m.lpips?.mean)}</Num>],
          ["LPIPS p95", <Num>{fmtLpips(m.lpips?.p95)}</Num>],
          ["PSNR", <Num>{m.psnr ? `${m.psnr.mean.toFixed(1)} dB` : DASH}</Num>],
          ["SSIM", <Num>{m.ssim ? m.ssim.mean.toFixed(3) : DASH}</Num>],
          ["ImageReward", <Num>{m.imageReward.mean.toFixed(2)}</Num>],
          ["Peak VRAM", <Num>{m.peakVramGb.toFixed(1)} GB</Num>],
        ]}
      />
      <Group
        title="Reproducibility"
        rows={[
          [
            "Config",
            r.configPath ? <Ext href={fileUrl(r.configPath)}>{basename(r.configPath)}</Ext> : DASH,
          ],
          [
            "Commit",
            r.commit ? <Ext href={commitUrl(r.commit)}>{r.commit.slice(0, 7)}</Ext> : DASH,
          ],
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
  );
}

export function ResultsTable({
  bench,
  limit,
  selectedId,
  openId,
  onSelect,
}: {
  bench: Benchmark;
  limit: number;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = [...bench.recipes].sort((a, b) => a.metrics.latencyS - b.metrics.latencyS);
  const openRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);
  const th = "py-2 pr-5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th className={cn(th, "pl-4 text-right")}>Latency</th>
            <th className={cn(th, "text-right")}>Throughput</th>
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
            const open = r.id === openId;
            return (
              <Fragment key={r.id}>
                <tr
                  ref={open ? openRef : undefined}
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-surface-alt",
                    out && "text-muted-foreground/60",
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
                  <td className="num py-2 pr-5 text-right whitespace-nowrap">
                    {`${r.metrics.throughputImgS.toFixed(2)} img/s`}
                  </td>
                  <td className="num py-2 pr-5 text-right">{fmtLpips(lpipsOf(r))}</td>
                  <td className="num py-2 pr-5 text-right">{speedup(bench, r).toFixed(1)}×</td>
                  <td className={cn("py-2 pr-5", sel ? "font-semibold" : "font-medium")}>
                    {r.name}
                  </td>
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
                      <span className="text-muted-foreground">{r.status.toLowerCase()}</span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-border">
                    <td colSpan={7} className="shadow-[inset_2px_0_0_var(--primary)]">
                      <Detail bench={bench} r={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
