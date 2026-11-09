import type { APIRoute } from "astro";
import { clerkClient } from "@clerk/astro/server";
import { env } from "cloudflare:workers";
import { authenticateManagementToken } from "@/lib/management-tokens";
import { handleManagementMcp } from "@/lib/management-mcp";

export const prerender = false;
export const ALL: APIRoute = async (context) => handleManagementMcp(context.request, env,
  (token) => authenticateManagementToken(env.DATABASE_URL, token, clerkClient(context)));
