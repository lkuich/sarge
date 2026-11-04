import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getProjectEnvironmentEvents, getProjectEnvironmentEventPage, getViewerAccount } from "@/lib/sarge-demo";
import { getWorkspaceAccess } from "@/lib/workspace-auth";

export const prerender = false;

export const GET: APIRoute = async (Astro) => {
  const auth = Astro.locals.auth();
  const { userId } = auth;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const access = getWorkspaceAccess(auth);
  if (!access) {
    return new Response(JSON.stringify({ error: "An active organization is required" }), {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const environmentId = Astro.params.environmentId ?? "";
  const requestedLimit = Number.parseInt(Astro.url.searchParams.get("limit") ?? "12", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 80) : 12;
  const startAt = Astro.url.searchParams.get("startAt");
  const endAt = Astro.url.searchParams.get("endAt");
  const currentUser = await Astro.locals.currentUser();
  const viewerEmails = currentUser?.emailAddresses.map((email) => email.emailAddress).filter(Boolean) ?? [];
  const account = await getViewerAccount(access, env.DATABASE_URL, { viewerEmails });
  const project = account.projects.find((candidate) =>
    candidate.environments.some((environment) => environment.id === environmentId),
  );
  const selectedEnvironment = project?.environments.find((environment) => environment.id === environmentId);

  if (!selectedEnvironment) {
    return new Response(JSON.stringify({ error: "Project environment not found" }), {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (Astro.url.searchParams.get("view") === "flow") {
    try {
      const params = Astro.url.searchParams;
      const result = await getProjectEnvironmentEventPage(env.DATABASE_URL, selectedEnvironment.id, {
        limit, startAt, endAt, cursor: params.get("cursor"), traffic: params.get("traffic"),
        categories: params.has("categories") ? params.get("categories")!.split(",").filter(Boolean) : undefined,
        search: params.get("search"), ref: params.get("ref"), affiliate: params.get("affiliate"),
      });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const invalid = message.startsWith("Invalid") || message === "Start must precede end";
      if (!invalid) console.error("Unable to load flow events", error);
      return Response.json({ error: invalid ? message : "Unable to load events. Please retry." }, { status: invalid ? 400 : 503 });
    }
  }

  const events = await getProjectEnvironmentEvents(env.DATABASE_URL, selectedEnvironment.id, { limit, startAt, endAt });
  if (!events) return Response.json({ error: "Unable to load events. Please retry." }, { status: 503 });

  return new Response(JSON.stringify({ events }), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
};
