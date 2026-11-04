import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { buildPlanRetentionSqlCase } from "@sarge/core";

type SqlClient = NeonQueryFunction<false, false>;
type ClaimedRequest = {
  id: string;
  scope: string;
  targetWorkspaceId: string | null;
  targetSiteId: string | null;
  startedAt: string;
};

const eventBatchSize = 5_000;
const subscriptionError = "Cancel the paid subscription before deleting this workspace.";

export const runScheduledMaintenance = async (databaseUrl: string) => {
  const sql = neon(databaseUrl);
  const result = { completed: 0, failed: 0, batches: 0, expiredEvents: 0 };

  for (let batch = 0; batch < 10; batch += 1) {
    const [request] = (await sql`
      WITH candidate AS (
        SELECT id FROM "DeletionRequest"
        WHERE status = 'pending'
          OR (status = 'processing' AND "startedAt" < NOW() - INTERVAL '15 minutes')
          OR (status = 'failed' AND "updatedAt" < NOW() - INTERVAL '30 minutes')
        ORDER BY "updatedAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "DeletionRequest" dr
      SET status = 'processing', "startedAt" = NOW(), "updatedAt" = NOW(), error = NULL
      FROM candidate WHERE dr.id = candidate.id
      RETURNING dr.id, scope, "targetWorkspaceId", "targetSiteId", "startedAt"::text
    `) as ClaimedRequest[];
    if (!request) break;

    try {
      if (!request.targetWorkspaceId || !['site', 'workspace'].includes(request.scope) ||
          (request.scope === 'site' && !request.targetSiteId)) {
        throw new Error("Deletion request target is missing or invalid.");
      }
      const status = await deleteRequestedData(sql, request);
      result.batches += 1;
      if (status === 'completed') result.completed += 1;
      if (status === 'failed') result.failed += 1;
    } catch (error) {
      await sql`
        UPDATE "DeletionRequest"
        SET status = 'failed', error = ${error instanceof Error ? error.message : 'Deletion failed'}, "updatedAt" = NOW()
        WHERE id = ${request.id} AND status = 'processing' AND "startedAt" = ${request.startedAt}::timestamp
      `;
      result.failed += 1;
      console.error('Deletion maintenance failed', { requestId: request.id });
    }
  }

  const [, expired] = await sql.transaction((tx) => [
    tx`SELECT set_config('statement_timeout', '30s', true), set_config('lock_timeout', '5s', true)`,
    tx`
      WITH expired AS (
        SELECT e.id FROM "Event" e
        JOIN "Site" s ON s.id = e."siteId"
        JOIN "Workspace" w ON w.id = s."workspaceId"
        WHERE w."planId" IN ('free', 'starter', 'growth')
          AND e."occurredAt" < NOW() - make_interval(days => ${tx.unsafe(buildPlanRetentionSqlCase('w."planId"'))})
        ORDER BY e."occurredAt", e.id
        FOR UPDATE OF e SKIP LOCKED
        FOR SHARE OF w SKIP LOCKED
        LIMIT ${eventBatchSize}::int
      ), deleted AS (
        DELETE FROM "Event" WHERE id IN (SELECT id FROM expired) RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `,
  ]);
  result.expiredEvents = Number(expired[0]?.count ?? 0);
  console.log('Data maintenance completed', result);
  return result;
};

const deleteRequestedData = async (sql: SqlClient, request: ClaimedRequest) => {
  const results = await sql.transaction((tx) => {
    const ownedRequest = tx`
      SELECT id FROM "DeletionRequest"
      WHERE id = ${request.id} AND status = 'processing' AND "startedAt" = ${request.startedAt}::timestamp
    `;
    const activeSubscription = tx`
      SELECT id FROM "Workspace"
      WHERE id = ${request.targetWorkspaceId} AND "stripeSubscriptionId" IS NOT NULL AND "billingStatus" <> 'canceled'
    `;
    const eligible = tx`EXISTS (${ownedRequest}) AND (${request.scope} <> 'workspace' OR NOT EXISTS (${activeSubscription}))`;
    const sites = tx`
      SELECT id FROM "Site" WHERE "workspaceId" = ${request.targetWorkspaceId}
        AND (${request.scope} = 'workspace' OR id = ${request.targetSiteId}) AND ${eligible}
    `;
    const noEvents = tx`NOT EXISTS (SELECT 1 FROM "Event" WHERE "siteId" IN (${sites}))`;

    return [
      tx`SELECT set_config('statement_timeout', '30s', true), set_config('lock_timeout', '5s', true)`,
      tx`SELECT id FROM "DeletionRequest" WHERE id IN (${ownedRequest}) FOR UPDATE`,
      // Lock parent rows so project creation and event ingestion cannot refill the target during this transaction.
      tx`SELECT id FROM "Workspace" WHERE id = ${request.targetWorkspaceId} AND EXISTS (${ownedRequest}) FOR UPDATE`,
      tx`SELECT id FROM "Site" WHERE id IN (${sites}) FOR UPDATE`,
      tx`
        WITH batch AS (
          SELECT id FROM "Event" WHERE "siteId" IN (${sites})
          ORDER BY "occurredAt", id FOR UPDATE SKIP LOCKED LIMIT ${eventBatchSize}::int
        )
        DELETE FROM "Event" WHERE id IN (SELECT id FROM batch)
      `,
      tx`
        DELETE FROM "NotificationDelivery"
        WHERE ("siteId" IN (${sites}) OR "siteEnvironmentId" IN (SELECT id FROM "SiteEnvironment" WHERE "siteId" IN (${sites})))
          AND ${noEvents}
      `,
      tx`DELETE FROM "DiagnosticFinding" WHERE "siteId" IN (${sites}) AND ${noEvents}`,
      tx`DELETE FROM "DiagnosticRun" WHERE "siteId" IN (${sites}) AND ${noEvents}`,
      tx`DELETE FROM "WebhookEndpoint" WHERE "siteId" IN (${sites}) AND ${noEvents}`,
      // Site deletion cascades environments, read/verification tokens, shares, and site privacy rules.
      tx`DELETE FROM "Site" WHERE id IN (${sites}) AND ${noEvents}`,
      tx`
        DELETE FROM "Workspace" WHERE id = ${request.targetWorkspaceId} AND ${request.scope} = 'workspace'
          AND ${eligible} AND NOT EXISTS (SELECT 1 FROM "Site" WHERE "workspaceId" = ${request.targetWorkspaceId})
      `,
      tx`
        UPDATE "DeletionRequest"
        SET status = CASE
              WHEN ${request.scope} = 'workspace' AND EXISTS (${activeSubscription}) THEN 'failed'
              WHEN EXISTS (SELECT 1 FROM "Event" WHERE "siteId" IN (${sites})) THEN 'pending'
              ELSE 'completed' END,
            error = CASE WHEN ${request.scope} = 'workspace' AND EXISTS (${activeSubscription}) THEN ${subscriptionError} ELSE NULL END,
            "completedAt" = CASE WHEN (${request.scope} <> 'workspace' OR NOT EXISTS (${activeSubscription})) AND ${noEvents} THEN NOW() ELSE NULL END,
            "updatedAt" = NOW()
        WHERE id IN (${ownedRequest}) RETURNING status
      `,
    ];
  });
  return results.at(-1)?.[0]?.status;
};
