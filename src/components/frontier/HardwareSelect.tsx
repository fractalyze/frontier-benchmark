import { ChevronDown } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { SelectContent, SelectItem } from "@/components/ui/select";
import type { HardwareInfo } from "@/data/frontier";
import { cn } from "@/lib/utils";

/** Inline hardware picker: reads as text with a chevron, opens the site-styled menu. */
export function HardwareSelect({
  hardware,
  value,
  onChange,
  className,
}: {
  hardware: HardwareInfo[];
  value: string;
  onChange: (hardware: string) => void;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label="Hardware"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 outline-none hover:text-primary focus-visible:underline",
          className,
        )}
      >
        <SelectPrimitive.Value />
        <ChevronDown aria-hidden="true" className="size-[0.7em] opacity-60" />
      </SelectPrimitive.Trigger>
      <SelectContent align="start" className="num text-[13px] font-normal">
        {hardware.map((h) => (
          <SelectItem key={h.slug} value={h.slug}>
            {h.name}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  );
}
