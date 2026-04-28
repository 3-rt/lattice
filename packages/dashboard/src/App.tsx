import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { ConversationsPage } from "./pages/conversations.tsx";
import { InsightsPage } from "./pages/insights.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";
import { TasksPage } from "./pages/tasks-page.tsx";
import { Workflows } from "./pages/workflows.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/insights" element={<InsightsPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
