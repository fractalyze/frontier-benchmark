import { Fragment, useEffect, useRef } from "react";
import { fmtLpips, lpipsOf, speedup, type Benchmark, type Recipe } from "@/data/frontier";
import { commitUrl, fileUrl, prUrl } from "@/data/site";
import { cn } from "@/lib/utils";

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

function Detail({ r }: { r: Recipe }) {
  return (
    <div className="grid gap-6 py-4 pr-2 pl-5 md:grid-cols-3">
      <Group
        title="Optimization"
        rows={
          r.optimization.length
            ? r.optimization.map((o) => [o.technique, <span className="num">{o.method}</span>])
            : [["—", "none (reference)"]]
        }
      />
      <Group
        title="Benchmark"
        rows={[
          ["Latency", <span className="num">{r.metrics.latencyS.toFixed(1)}s</span>],
          ["LPIPS mean", <span className="num">{fmtLpips(r.metrics.lpips?.mean)}</span>],
          ["LPIPS p95", <span className="num">{fmtLpips(r.metrics.lpips?.p95)}</span>],
          ["Peak VRAM", <span className="num">{r.metrics.peakVramGb.toFixed(1)} GB</span>],
        ]}
      />
      <Group
        title="Reproducibility"
        rows={[
          ["Config", r.configPath ? <Ext href={fileUrl(r.configPath)}>config.yaml</Ext> : "—"],
          ["Commit", r.commit ? <Ext href={commitUrl(r.commit)}>{r.commit.slice(0, 7)}</Ext> : "—"],
          ["Submission", r.pr ? <Ext href={prUrl(r.pr)}>PR #{r.pr}</Ext> : "—"],
          [
            "Status",
            r.status === "Verified"
              ? "Verified"
              : `${r.status} — not yet reproduced by maintainers`,
          ],
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
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th className={cn(th, "pl-4 text-right")}>Latency</th>
            <th className={cn(th, "text-right")}>LPIPS</th>
            <th className={cn(th, "text-right")}>Speedup</th>
            <th className={th}>Recipe</th>
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
                  <td className="num py-2 pr-5 text-right">{fmtLpips(lpipsOf(r))}</td>
                  <td className="num py-2 pr-5 text-right">{speedup(bench, r).toFixed(1)}×</td>
                  <td className={cn("py-2 pr-5", sel ? "font-semibold" : "font-medium")}>
                    {r.name}
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
                    <td colSpan={5} className="shadow-[inset_2px_0_0_var(--primary)]">
                      <Detail r={r} />
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
