import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-8">
        <header className="flex items-baseline justify-between border-b border-border py-3.5">
          <Link to="/" className="text-[14px] font-semibold tracking-tight">
            Inference Frontier
          </Link>
          <nav className="flex gap-5 text-[13px] text-muted-foreground">
            {["Methodology", "Submit", "GitHub"].map((l) => (
              <a key={l} href="#" className="hover:text-foreground">
                {l}
              </a>
            ))}
          </nav>
        </header>
        {children}
        <footer className="mt-16 border-t border-border pt-3 text-[12px] text-muted-foreground">
          Maintained by Fractalyze and contributors
        </footer>
      </div>
    </div>
  );
}
