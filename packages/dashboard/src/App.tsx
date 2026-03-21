import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          {/* Phase 3/4 routes: /flow, /tasks, /workflows */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
