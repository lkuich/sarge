import { neon } from '@neondatabase/serverless';
import { buildPlanRetentionFilterSql, configuredHostEventSql, ecommerceTrackingPlan } from '@sarge/core';

import type { ProjectInsights } from './insights';

// Only fixed, documented names leave the database; custom names can contain personal data.
const knownNames = [...ecommerceTrackingPlan.events.map(event => event.name), 'meta.pixel.fire', 'google.tag.fire', 'data_layer.push'];
const watchdogs = ['meta.pixel.fire', 'google.tag.fire', 'data_layer.push'];

export async function getProjectInsights(databaseUrl: string, environmentId: string): Promise<ProjectInsights> {
  const sql = neon(databaseUrl, { fetchOptions: { signal: AbortSignal.timeout(12_000) } });
  const required = ecommerceTrackingPlan.events.flatMap(event =>
    (event.requiredProperties ?? []).map(property => ({ name: event.name, property })));
  const query = sql`
    WITH bounds AS (
      SELECT date_trunc('day', NOW() AT TIME ZONE 'UTC') AS finish
    ), scoped AS MATERIALIZED (
      SELECT CASE WHEN e.name = ANY(${knownNames}::text[]) THEN e.name ELSE 'custom events' END AS name,
        e."occurredAt", nullif(e."sessionId", '') AS session, e.properties,
        CASE WHEN e."occurredAt" >= b.finish - INTERVAL '7 days' THEN 'current' ELSE 'previous' END AS period,
        NOT (e.name = ANY(${watchdogs}::text[])) AS primary_event,
        EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(required)}::jsonb) AS r(name text, property text)
          WHERE r.name = e.name AND (e.properties->r.property IS NULL
            OR e.properties->r.property = 'null'::jsonb OR e.properties->r.property = '""'::jsonb)) AS incomplete
      FROM "Event" e JOIN "Site" s ON s.id = e."siteId"
      JOIN "Workspace" w ON w.id = s."workspaceId" CROSS JOIN bounds b
      WHERE e."siteEnvironmentId" = ${environmentId}
        AND e."occurredAt" >= b.finish - INTERVAL '14 days' AND e."occurredAt" < b.finish
        AND NOT coalesce(e.properties->'sarge_test' = 'true'::jsonb, false)
        AND ${sql.unsafe(buildPlanRetentionFilterSql('e."occurredAt"', 'w."planId"'))}
        AND ${sql.unsafe(configuredHostEventSql('e', 's'))}
    ), sessions AS (
      SELECT period, session,
        bool_or(name = 'checkout.started') AS checkout,
        bool_or(name = 'purchase.completed') AS purchase,
        bool_or(name = 'meta.pixel.fire' AND lower(trim(properties->>'event_name')) = 'purchase') AS meta
      FROM scoped WHERE session IS NOT NULL GROUP BY period, session
    ), duplicates AS (
      SELECT period, count(*)::int AS count FROM (
        SELECT period, trim(properties->>'order_id') FROM scoped
        WHERE name = 'purchase.completed' AND jsonb_typeof(properties->'order_id') = 'string'
          AND trim(properties->>'order_id') <> ''
        GROUP BY period, trim(properties->>'order_id') HAVING count(*) > 1
      ) orders GROUP BY period
    ), mix AS (
      SELECT period, name, count(*)::int AS count FROM scoped GROUP BY period, name
    ), periods AS (
      SELECT p.period, jsonb_build_object(
        'events', count(*) FILTER (WHERE e.primary_event),
        'sessions', count(DISTINCT e.session) FILTER (WHERE e.primary_event),
        'activeDays', count(DISTINCT e."occurredAt"::date) FILTER (WHERE e.primary_event),
        'incompleteEvents', count(*) FILTER (WHERE e.incomplete),
        'checkoutSessions', (SELECT count(*) FROM sessions x WHERE x.period = p.period AND x.checkout),
        'purchaseSessions', (SELECT count(*) FROM sessions x WHERE x.period = p.period AND x.purchase),
        'checkoutWithPurchase', (SELECT count(*) FROM sessions x WHERE x.period = p.period AND x.checkout AND x.purchase),
        'purchasesWithoutMeta', (SELECT count(*) FROM sessions x WHERE x.period = p.period AND x.purchase AND NOT coalesce(x.meta, false)),
        'duplicateOrders', coalesce((SELECT count FROM duplicates x WHERE x.period = p.period), 0),
        'eventMix', coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY name)
          FROM mix x WHERE x.period = p.period), '[]'::jsonb)
      ) AS data FROM (VALUES ('current'), ('previous')) p(period)
      LEFT JOIN scoped e ON e.period = p.period GROUP BY p.period
    ) SELECT
      to_char(b.finish - INTERVAL '14 days', 'YYYY-MM-DD') AS start,
      to_char(b.finish - INTERVAL '7 days', 'YYYY-MM-DD') AS midpoint,
      to_char(b.finish, 'YYYY-MM-DD') AS end,
      (SELECT data FROM periods WHERE period = 'current') AS current,
      (SELECT data FROM periods WHERE period = 'previous') AS previous,
      (SELECT jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'events', count) ORDER BY day)
       FROM (SELECT d.day, count(e.name) FILTER (WHERE e.primary_event)::int AS count
         FROM generate_series(b.finish - INTERVAL '14 days', b.finish - INTERVAL '1 day', INTERVAL '1 day') d(day)
         LEFT JOIN scoped e ON e."occurredAt" >= d.day AND e."occurredAt" < d.day + INTERVAL '1 day'
         GROUP BY d.day) daily) AS days
    FROM bounds b
  `;
  const [rows] = await sql.transaction([query], { readOnly: true });
  return rows[0] as ProjectInsights;
}

