import type { Command } from "commander";
import { RelayClient } from "../lib/client.js";
import { getRelayUrl } from "../lib/config.js";
import { statusIcon } from "../lib/format.js";
import http from "http";

function streamTaskEvents(eventsUrl: string, taskId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(eventsUrl);
    const req = http.get(
      { hostname: url.hostname, port: url.port, path: url.pathname, headers: { Accept: "text/event-stream" } },
      (res) => {
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentData = "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              currentData += line.slice(6);
            } else if (line === "" && currentData) {
              try {
                const event = JSON.parse(currentData);
                if (event.taskId === taskId || event.task?.id === taskId) {
                  switch (event.type) {
                    case "task:routed":
                      console.log(`${statusIcon("working")} Routed to ${event.agentName} (${event.reason})`);
                      break;
                    case "task:progress":
                      console.log(`  ${event.message}`);
                      break;
                    case "task:completed": {
                      console.log(`${statusIcon("completed")} Task completed`);
                      const artifacts = event.task?.artifacts ?? [];
                      for (const artifact of artifacts) {
                        for (const part of artifact.parts ?? []) {
                          if (part.text) console.log(`\n${part.text}`);
                        }
                      }
                      req.destroy();
                      resolve();
                      return;
                    }
                    case "task:failed":
                      console.log(`${statusIcon("failed")} Task failed: ${event.error}`);
                      req.destroy();
                      resolve();
                      return;
                    case "task:canceled":
                      console.log(`${statusIcon("offline")} Task canceled`);
                      req.destroy();
                      resolve();
                      return;
                  }
                }
              } catch { /* ignore parse errors */ }
              currentData = "";
            }
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
  });
}

export function registerSend(program: Command) {
  program
    .command("send <task>")
    .description("Send a task to an agent")
    .option("--to <agent>", "Route to a specific agent")
    .action(async (taskText: string, opts: { to?: string }) => {
      const relayUrl = getRelayUrl();
      const client = new RelayClient(relayUrl);
      try {
        console.log(`Sending task: "${taskText}"${opts.to ? ` \u2192 ${opts.to}` : " (auto-route)"}...\n`);

        const eventsUrl = client.getEventsUrl();
        const task = await client.sendTask(taskText, opts.to);
        const taskId = task.id;
        console.log(`Task ${taskId} created\n`);

        if (task.status === "completed" || task.status === "failed") {
          console.log(`${statusIcon(task.status)} Task ${taskId} \u2014 ${task.status}`);
          if (task.artifacts?.length) {
            for (const artifact of task.artifacts) {
              for (const part of artifact.parts) {
                if (part.text) console.log(`\n${part.text}`);
              }
            }
          }
          return;
        }

        await streamTaskEvents(eventsUrl, taskId);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
