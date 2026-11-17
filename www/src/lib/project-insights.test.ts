// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insightFixture } from './insights.test-fixture';
const db = vi.hoisted(() => ({ transaction: vi.fn(), query: '', values: [] as unknown[] }));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
    const params: unknown[] = [];
    const query = strings.reduce((text, part, index) => {
      if (index === values.length) return text + part;
      const value = values[index];
      if (value && typeof value === 'object' && 'sql' in value) return text + part + value.sql;
      params.push(value);
      return text + part + `$${params.length}`;
    }, '');
    db.query = query;
    db.values = params;
    return { query, params };
  }, { unsafe: (sql: string) => ({ sql }), transaction: db.transaction }),
}));
import { getProjectInsights } from './project-insights';

beforeEach(() => { db.transaction.mockReset().mockResolvedValue([[insightFixture]]); });

it('binds the environment and uses host, retention, test-traffic and date scope in a read-only transaction', async () => {
  expect(await getProjectInsights('postgres://test', 'private-environment')).toEqual(insightFixture);
  expect(db.values).toContain('private-environment');
  expect(db.query).not.toContain('private-environment');
  expect(db.query).toContain('e."siteEnvironmentId" = $');
  expect(db.query).toContain('s."customDomain"');
  expect(db.query).toContain('w."planId"');
  expect(db.query).toContain("e.properties->'sarge_test' = 'true'::jsonb");
  expect(db.query).toContain('e."occurredAt" < b.finish');
  expect(db.transaction.mock.calls[0][1]).toEqual({ readOnly: true });
});

// Run against any Neon test connection. CTEs shadow tables: no production rows are read or written.
describe.skipIf(!process.env.INSIGHTS_SQL_TEST_DATABASE_URL)('Postgres aggregate semantics', () => {
  async function aggregate(environmentId = 'env1') {
    const { neon } = await vi.importActual<typeof import('@neondatabase/serverless')>('@neondatabase/serverless');
    const sql = neon(process.env.INSIGHTS_SQL_TEST_DATABASE_URL!);
    const event = (name: string, sessionId: string, properties = {}, extra = {}) => ({
      name, sessionId, properties, dayOffset: -1, siteId: 'site1', siteEnvironmentId: 'env1', url: 'https://shop.example/path?email=private', referrer: null, ...extra,
    });
    const fixture = [
      event('page.view', 'a'), event('checkout.started', 'a', { value: 10, currency: 'USD' }),
      event('purchase.completed', 'a', { order_id: 'private-order', value: 10, currency: 'USD' }),
      event('purchase.completed', 'a', { order_id: 'private-order', value: 10, currency: 'USD' }),
      event('meta.pixel.fire', 'a', { event_name: 'Purchase' }),
      event('purchase.completed', 'b'), event('product.viewed', 'b', { product_id: null }),
      event('cart.added', 'b', { product_id: 'p', price: '' }),
      event('customer-private@example.com', 'b'), event('google.tag.fire', 'b'), event('page.view', ''),
      event('page.view', 'p', {}, { dayOffset: -8 }), event('checkout.started', 'p', {}, { dayOffset: -8 }),
      event('page.view', 'outside', {}, { siteEnvironmentId: 'another-env' }),
      event('page.view', 'outside', {}, { url: 'https://unrelated.example' }),
      event('page.view', 'outside', { sarge_test: true }),
      event('page.view', 'outside', {}, { dayOffset: 0 }), event('page.view', 'outside', {}, { dayOffset: -15 }),
    ];
    await getProjectInsights('capture', environmentId);
    const fixtureParam = `$${db.values.length + 1}`;
    const query = db.query.replace('WITH bounds', `WITH "Event" AS (
      SELECT r.*, date_trunc('day', NOW() AT TIME ZONE 'UTC') + make_interval(days => r."dayOffset") AS "occurredAt"
      FROM jsonb_to_recordset(${fixtureParam}::jsonb) AS r(name text, "sessionId" text, properties jsonb, "dayOffset" int,
        "siteId" text, "siteEnvironmentId" text, url text, referrer text)
    ), "Site" AS (SELECT 'site1' AS id, 'workspace1' AS "workspaceId", 'shop.example' AS "customDomain"),
    "Workspace" AS (SELECT 'workspace1' AS id, 'growth' AS "planId"), bounds`);
    const [rows] = await sql.transaction([sql.query(query, [...db.values, JSON.stringify(fixture)])], { readOnly: true });
    return rows[0];
  }

  it('computes deduplicated session counts, completeness and observation gaps without leaking identifiers', async () => {
    const data = await aggregate();
    expect(data.current).toMatchObject({ events: 9, sessions: 2, activeDays: 1, checkoutSessions: 1,
      purchaseSessions: 2, checkoutWithPurchase: 1, purchasesWithoutMeta: 1, duplicateOrders: 1, incompleteEvents: 3 });
    expect(data.previous).toMatchObject({ events: 2, sessions: 1, incompleteEvents: 1 });
    expect(data.current.eventMix).toContainEqual({ name: 'custom events', count: 1 });
    expect(data.days).toHaveLength(14);
    expect(data.days.reduce((sum: number, day: { events: number }) => sum + day.events, 0)).toBe(11);
    expect(JSON.stringify(data)).not.toMatch(/private|shop\.example|sessionId|order_id/);
  });

  it('returns zero counts and fourteen zero-filled days for an empty environment', async () => {
    const data = await aggregate('empty-environment');
    expect(data.current.events).toBe(0);
    expect(data.current.eventMix).toEqual([]);
    expect(data.days.every((day: { events: number }) => day.events === 0)).toBe(true);
  });
});
