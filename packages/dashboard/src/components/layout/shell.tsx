import type { ReactNode } from "react";
import { Sidebar } from "./sidebar.tsx";
import { useSSE } from "../../hooks/use-sse.ts";

export function Shell({ children }: { children: ReactNode }) {
  useSSE();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-canvas">
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
