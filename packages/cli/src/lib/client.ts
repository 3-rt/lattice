export class RelayClient {
  constructor(private baseUrl: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async listAgents() {
    return this.get<Array<{ name: string; status: string; card: Record<string, unknown> }>>("/api/agents");
  }

  async sendTask(text: string, agent?: string) {
    return this.post<{ id: string; status: string; artifacts?: Array<{ name: string; parts: Array<{ type: string; text?: string }> }> }>("/api/tasks", { text, agent, execute: true });
  }

  async listTasks(status?: string) {
    const path = status ? `/api/tasks?status=${status}` : "/api/tasks";
    return this.get<Array<{ id: string; status: string }>>(path);
  }

  async getTask(id: string) {
    return this.get<{ id: string; status: string }>(`/api/tasks/${id}`);
  }

  async cancelTask(id: string) {
    return this.post<{ id: string; status: string }>(`/api/tasks/${id}/cancel`);
  }

  async getRoutingStats() {
    return this.get<Array<{ agent_name: string; category: string; successes: number; failures: number; total_latency_ms: number }>>("/api/routing/stats");
  }

  getEventsUrl(): string {
    return `${this.baseUrl}/api/events`;
  }
}
