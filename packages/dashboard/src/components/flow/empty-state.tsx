import { Unplug } from "lucide-react";

export function FlowEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-full border border-gray-800 bg-gray-900 p-4">
        <Unplug className="h-8 w-8 text-gray-600" />
      </div>
      <h2 className="text-sm font-semibold text-gray-400">
        No agents connected
      </h2>
      <p className="max-w-xs text-xs text-gray-600">
        Register adapters in <code className="text-gray-500">lattice.config.json</code>{" "}
        and start the relay to see agents appear on the flow canvas.
      </p>
    </div>
  );
}
