import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("app navigation routes", () => {
  it("keeps the app shell in the top nav instead of a sidebar", () => {
    const layout = readSource("../../layouts/AppLayout.astro");

    expect(layout).not.toContain("<aside");
    expect(layout).not.toContain('href="/app/projects"');
    expect(layout).not.toContain('href="/admin"');
    expect(layout).not.toContain('label: "Admin"');
    expect(layout).toContain('href="/app"');
    expect(layout).toContain('href="/docs"');
    expect(layout).toContain('Docs');
    expect(layout).toContain("{account.name}");
    expect(layout).toContain("{account.role}");
    expect(layout).toContain("{account.plan}");
  });

  it("does not ship the old admin page", () => {
    expect(existsSync(sourcePath("../admin/index.astro"))).toBe(false);
  });

  it("serves project sections from the overview page and removes the old projects index", () => {
    const overview = readSource("./index.astro");

    expect(existsSync(sourcePath("./projects/index.astro"))).toBe(false);
    expect(overview).toContain('heading={needsWorkspaceSetup ? "Create your workspace" : "Overview"}');
    expect(overview).toContain("projectCountLabel");
    expect(overview).toContain("New project");
    expect(overview).toContain('href={`/app/projects/${project.slug}`}');
  });

  it("keeps overview metrics high-level without duplicating the project list", () => {
    const overview = readSource("./index.astro");

    expect(overview).toContain("data-overview-metrics");
    expect(overview).toContain("data-project-distribution");
    expect(overview).toContain("Coverage");
    expect(overview).toContain("Throughput");
    expect(overview).toContain("Attention");
    expect(overview).toContain("buildProjectDistribution(account.projects)");
    expect(overview).not.toContain("Recent project activity");
    expect(overview).not.toContain("<Table>");
  });

  it("routes project flows back to overview instead of the removed index", () => {
    const newProject = readSource("./projects/new.astro");
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(newProject).not.toContain('href="/app/projects"');
    expect(projectDetail).not.toContain('href="/app/projects"');
    expect(projectDetail).not.toContain('Astro.redirect("/app/projects")');
    expect(newProject).toContain('href="/app"');
    expect(projectDetail).toContain('Astro.redirect("/app")');
  });
});
