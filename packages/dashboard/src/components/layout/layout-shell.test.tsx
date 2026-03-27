import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { Shell } from "./shell.tsx";
import { Sidebar } from "./sidebar.tsx";
import { useLatticeStore } from "../../store/lattice-store.ts";

describe("dashboard shell foundation", () => {
  beforeEach(() => {
    useLatticeStore.setState({
      agents: [],
      tasks: [],
      connectionStatus: "connected",
    });
  });

  it("defines the shared orbital console design tokens and semantic classes", () => {
    const cssPath = resolve(import.meta.dirname, "../../index.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("--bg-app:");
    expect(css).toContain("--surface-panel:");
    expect(css).toContain(".app-shell");
    expect(css).toContain(".page-header-eyebrow");
    expect(css).toContain(".ui-input");
  });

  it("renders the shell and sidebar with the new semantic chrome classes", () => {
    useLatticeStore.setState({ connectionStatus: "connected" });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/flow"]}>
        <Shell>
          <div>content</div>
        </Shell>
      </MemoryRouter>
    );

    expect(html).toContain("app-shell");
    expect(html).toContain("control-sidebar");
    expect(html).toContain("app-canvas");
    expect(html).toContain("nav-link-active");
    expect(html).toContain("System link");
  });

  it("renders disconnected status copy in the sidebar footer", () => {
    useLatticeStore.setState({ connectionStatus: "disconnected" });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(html).toContain("System link offline");
  });
});
