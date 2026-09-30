import { useNavigate } from "@tanstack/react-router";
import { BENCHMARKS, HARDWARE, modelBySlug } from "@/data/frontier";
import { HardwareSelect } from "./HardwareSelect";

/** Page title: the model is fixed, the hardware is a select that navigates. */
export function IdentitySelect({ model, hardware }: { model: string; hardware: string }) {
  const navigate = useNavigate();
  const hws = HARDWARE.filter((h) =>
    BENCHMARKS.some((b) => b.model === model && b.hardware === h.slug),
  );
  return (
    <h1 className="flex flex-wrap items-baseline gap-x-3 text-[26px] leading-tight font-semibold tracking-tight">
      <span>{modelBySlug(model)?.name ?? model}</span>
      <span className="text-muted-foreground">×</span>
      <HardwareSelect
        hardware={hws}
        value={hardware}
        onChange={(h) => navigate({ to: "/$model/$hardware", params: { model, hardware: h } })}
      />
    </h1>
  );
}
