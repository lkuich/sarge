import { clerkMiddleware } from "@clerk/astro/server";
import { sequence } from "astro:middleware";
import { applySecurityHeaders } from "@/lib/security-headers";

export const onRequest = sequence(
  async (_context, next) => applySecurityHeaders(await next()),
  clerkMiddleware(),
);
