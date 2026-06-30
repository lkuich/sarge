import type { APIRoute } from "astro";
import {
  canManageProject,
  getViewerAccount,
  markProjectTrafficAsTest,
  type TestTrafficSubjectKind,
} from "@/lib/sarge-demo";

export const prerender = false;

export const POST: APIRoute = async (Astro) => {
  const { userId } = Astro.locals.auth();
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const runtimeEnv = readRuntimeEnv(Astro.locals);
  const environmentId = Astro.params.environmentId ?? "";
  const body = await readRequestBody(Astro.request);
  const kind = body.kind;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const requestedLimit = Number.parseInt(String(body.limit ?? "80"), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 80) : 80;

  if (!(kind === "user" || kind === "session") || !subjectId) {
    return json({ error: "Choose a user or session to mark as test." }, 400);
  }

  const currentUser = await Astro.locals.currentUser();
  const viewerEmails = currentUser?.emailAddresses.map((email) => email.emailAddress).filter(Boolean) ?? [];
  const account = await getViewerAccount(userId, runtimeEnv.DATABASE_URL, { viewerEmails });
  const project = account.projects.find((candidate) =>
    candidate.environments.some((environment) => environment.id === environmentId),
  );
  const selectedEnvironment = project?.environments.find((environment) => environment.id === environmentId);

  if (!project || !selectedEnvironment) {
    return json({ error: "Project environment not found" }, 404);
  }

  if (!canManageProject(project)) {
    return json({ error: "Edit access is required to mark test traffic." }, 403);
  }

  const result = await markProjectTrafficAsTest(runtimeEnv.DATABASE_URL, selectedEnvironment.id, {
    kind,
    subjectId,
    limit,
  });

  if (!result.success) {
    return json({ error: result.error }, 400);
  }

  return json({ events: result.events, updatedCount: result.updatedCount }, 200);
};

const readRequestBody = async (request: Request): Promise<ManualTestTrafficRequest> => {
  try {
    const value = (await request.json()) as Partial<ManualTestTrafficRequest>;
    return {
      kind: value.kind,
      subjectId: value.subjectId,
      limit: value.limit,
    };
  } catch {
    return {};
  }
};

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });

const readRuntimeEnv = (locals: unknown) =>
  ((locals as { runtime?: { env?: { DATABASE_URL?: string } } }).runtime?.env ?? {}) as { DATABASE_URL?: string };

interface ManualTestTrafficRequest {
  kind?: TestTrafficSubjectKind;
  subjectId?: string;
  limit?: number;
}
