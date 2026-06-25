import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getViewerAccount } from "@/lib/sarge-demo";

export const prerender = false;

export const GET: APIRoute = async (Astro) => {
  const { userId } = Astro.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const environmentId = Astro.params.environmentId ?? "";
  const currentUser = await Astro.locals.currentUser();
  const viewerEmails = currentUser?.emailAddresses.map((email) => email.emailAddress).filter(Boolean) ?? [];
  const account = await getViewerAccount(userId, env.DATABASE_URL, { viewerEmails });
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

  return new Response(JSON.stringify({ events: selectedEnvironment.recentEvents.slice(0, 12) }), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
};
