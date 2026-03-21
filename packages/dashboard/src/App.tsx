import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          {/* Phase 3/4 routes: /tasks, /workflows */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
