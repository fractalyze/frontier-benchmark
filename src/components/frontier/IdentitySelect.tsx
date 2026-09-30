import { useNavigate } from "@tanstack/react-router";
import { modelBySlug } from "@/data/frontier";
import { cn } from "@/lib/utils";
import { HardwareSelect } from "./HardwareSelect";

/** Page title: the model is fixed, the hardware is a select that navigates. */
export function IdentitySelect({ model, hardware }: { model: string; hardware: string }) {
  const navigate = useNavigate();
  const title = "text-[26px] leading-tight font-semibold tracking-tight";
  return (
    <h1 className={cn(title, "flex flex-wrap items-baseline gap-x-3")}>
      <span>{modelBySlug(model)?.name ?? model}</span>
      <span className="text-muted-foreground">×</span>
      <HardwareSelect
        model={model}
        value={hardware}
        className={title}
        onChange={(h) => navigate({ to: "/$model/$hardware", params: { model, hardware: h } })}
      />
    </h1>
  );
}
