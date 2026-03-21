import type { ReactNode } from "react";
import { Sidebar } from "./sidebar.tsx";
import { useSSE } from "../../hooks/use-sse.ts";

export function Shell({ children }: { children: ReactNode }) {
  useSSE();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
