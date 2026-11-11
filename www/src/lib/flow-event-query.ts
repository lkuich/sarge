export interface FlowEventQuery {
  limit: number;
  startAt?: string | null;
  endAt?: string | null;
  cursor?: string | null;
  traffic?: string | null;
  categories?: string[];
  search?: string | null;
  eventNames?: string | null;
  ref?: string | null;
  affiliate?: string | null;
}

export const parseEventNameFilter = (value: string) =>
  [...new Set(value.split(',').map(name => name.trim().toLowerCase()).filter(Boolean))];

export function buildFlowEventQuery(query: FlowEventQuery, environmentId: string, scope: string) {
  const params: unknown[] = [environmentId];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const filters = ['e."siteEnvironmentId" = $1', scope];
  for (const [key, operator] of [['startAt', '>='], ['endAt', '<=']] as const) {
    if (query[key]) {
      const date = new Date(query[key]!);
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
      filters.push(`e."occurredAt" ${operator} (${bind(date.toISOString())}::timestamptz AT TIME ZONE 'UTC')`);
    }
  }
  if (query.startAt && query.endAt && new Date(query.startAt) > new Date(query.endAt)) throw new Error('Start must precede end');
  if (query.traffic && !['real', 'test', 'all'].includes(query.traffic)) throw new Error('Invalid traffic filter');
  const test = `coalesce(e.properties->'sarge_test' = 'true'::jsonb, false)`;
  if (query.traffic === 'real') filters.push(`NOT (${test})`);
  if (query.traffic === 'test') filters.push(test);
  if (query.categories) {
    if (query.categories.some(c => !['conversion', 'watchdog', 'page', 'custom'].includes(c))) throw new Error('Invalid event category');
    filters.push(`(CASE WHEN e.name IN ('meta.pixel.fire', 'google.tag.fire', 'data_layer.push') THEN 'watchdog'
      WHEN e.properties->'conversion' = 'true'::jsonb OR e.name LIKE '%purchase%' OR e.name LIKE '%checkout%' THEN 'conversion'
      WHEN e.name = 'page.view' THEN 'page' ELSE 'custom' END) = ANY(${bind(query.categories)}::text[])`);
  }
  for (const [key, urlKey] of [['ref', 'sarge_ref'], ['affiliate', 'sarge_aff']] as const) {
    const value = query[key]?.trim().toLowerCase();
    if (value) filters.push(`(strpos(lower(coalesce(e.${key}, '')), ${bind(value)}) > 0 OR
      (e.${key} IS NULL AND strpos(lower(coalesce(substring(e.url from '[?&]${urlKey}=([^&]*)'), '')), ${bind(encodeURIComponent(value).toLowerCase())}) > 0))`);
  }
  if (query.search?.trim()) {
    filters.push(`strpos(lower(concat_ws(' ', e.name, e."sessionId", e."userId", e.url, e.referrer, e.title,
      e.ref, e.affiliate, 'sarge_ref:' || e.ref, 'sarge_aff:' || e.affiliate)), ${bind(query.search.trim().toLowerCase())}) > 0`);
  }
  const eventNames = parseEventNameFilter(query.eventNames ?? '');
  if (eventNames.length) {
    filters.push(`(${eventNames.map(name => `strpos(lower(e.name), ${bind(name)}) > 0`).join(' OR ')})`);
  }
  let cursorFilter = 'true';
  if (query.cursor) {
    let cursor: unknown;
    try { cursor = JSON.parse(query.cursor); } catch { throw new Error('Invalid cursor'); }
    if (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || !Number.isFinite(Date.parse(cursor[0])) || typeof cursor[1] !== 'string') throw new Error('Invalid cursor');
    cursorFilter = `("occurredAt", id) < ((${bind(cursor[0])}::timestamptz AT TIME ZONE 'UTC'), ${bind(cursor[1])})`;
  }
  const limit = Math.min(Math.max(Number.isFinite(query.limit) ? query.limit : 80, 1), 500);
  return {
    limit, params,
    sql: `WITH matching AS (
      SELECT e.* FROM "Event" e JOIN "Site" s ON s.id = e."siteId" JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE ${filters.join(' AND ')}
    ), page AS (
      SELECT * FROM matching WHERE ${cursorFilter} ORDER BY "occurredAt" DESC, id DESC LIMIT ${bind(limit + 1)}
    ) SELECT
      (SELECT count(*)::int FROM matching) AS "totalEvents",
      (SELECT count(DISTINCT coalesce(NULLIF("userId", ''), '(no user ID)'))::int FROM matching) AS "totalUsers",
      (SELECT count(DISTINCT coalesce(NULLIF("sessionId", ''), '(no session ID)'))::int FROM matching) AS "totalSessions",
      coalesce((SELECT jsonb_agg(to_jsonb(page) || jsonb_build_object('occurredAt', page."occurredAt" AT TIME ZONE 'UTC', 'receivedAt', page."receivedAt" AT TIME ZONE 'UTC') ORDER BY "occurredAt" DESC, id DESC) FROM page), '[]'::jsonb) AS events`,
  };
}

export const realTrafficEventSql = (alias: 'e' | 'e_mix' | 'e_trend') =>
  `${alias}.name NOT IN ('meta.pixel.fire', 'google.tag.fire', 'data_layer.push') AND NOT coalesce(${alias}.properties->'sarge_test' = 'true'::jsonb, false)`;
