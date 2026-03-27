import { Unplug } from "lucide-react";

export function FlowEmptyState() {
  return (
    <div className="surface-panel-strong flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Unplug className="h-9 w-9 text-[var(--text-soft)]" />
      </div>
      <div>
        <p className="page-header-eyebrow">Live flow unavailable</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
          Mission control is waiting for agents
        </h2>
      </div>
      <p className="max-w-md text-sm leading-6 text-[var(--text-muted)]">
        Register adapters in <code className="text-[var(--text-main)]">lattice.config.json</code>{" "}
        and start the relay to see agents appear on the flow canvas.
      </p>
    </div>
  );
}
