import { describe, expect, it } from 'vitest';
import { buildFlowEventQuery, realTrafficEventSql } from './flow-event-query';

describe('flow query', () => {
  it('matches any selected name exactly using a bound array before pagination', () => {
    const query = buildFlowEventQuery({ limit: 80, eventNames: ['Checkout', "Order, O'Reilly%"], traffic: 'real', search: 'buyer' }, 'env', 'true');
    expect(query.sql).toContain('e.name = ANY($3::text[])');
    expect(query.sql).not.toContain("O'Reilly");
    expect(query.params).toEqual(['env', 'buyer', ['Checkout', "Order, O'Reilly%"], 81]);
    expect(query.sql.indexOf('e.name = ANY')).toBeLessThan(query.sql.indexOf('), page AS'));
    expect(buildFlowEventQuery({ limit: 80, eventNames: [] }, 'env', 'true').sql).not.toContain('e.name = ANY');
  });
  it('lists all observed names in the environment and retention scope independently of filters and pagination', () => {
    const query = buildFlowEventQuery({ limit: 1, eventNames: ['purchase.completed'], search: 'buyer', startAt: '2026-11-10T00:00:00Z' }, 'env', 'retention_and_host_scope');
    const observed = query.sql.slice(query.sql.indexOf('SELECT DISTINCT e.name'), query.sql.indexOf('AS "eventNames"'));
    expect(observed).toContain('WHERE e."siteEnvironmentId" = $1 AND retention_and_host_scope');
    expect(observed).not.toContain('ANY(');
    expect(observed).not.toContain('LIMIT');
    expect(observed).not.toContain('strpos');
    expect(observed).not.toContain('"occurredAt"');
  });
  it('filters before totals and pagination, with bound search values and stable ordering', () => {
    const query = buildFlowEventQuery({ limit: 80, traffic: 'real', categories: ['conversion'], search: "O'Reilly%", startAt: '2026-10-24T00:00:00Z', endAt: '2026-10-28T00:00:00Z' }, 'env_customer', 'true');
    expect(query.sql).toContain('count(*)::int FROM matching');
    expect(query.sql).toContain('SELECT * FROM matching WHERE');
    expect(query.sql).toContain('ORDER BY "occurredAt" DESC, id DESC LIMIT');
    expect(query.sql).toContain("NOT (coalesce(e.properties->'sarge_test'");
    expect(query.sql).not.toContain("O'Reilly");
    expect(query.params).toContain("o'reilly%");
    expect(query.params).toContainEqual(['conversion']);
    expect(query.params.at(-1)).toBe(81);
  });
  it('uses timestamp and id for cursor ties without changing full matching totals', () => {
    const query = buildFlowEventQuery({ limit: 2, cursor: JSON.stringify(['2026-10-25T00:00:00Z', 'event_b']) }, 'env_customer', 'true');
    expect(query.sql).toContain(`("occurredAt", id) < (($2::timestamptz AT TIME ZONE 'UTC'), $3)`);
    expect(query.params).toEqual(['env_customer', '2026-10-25T00:00:00Z', 'event_b', 3]);
  });
  it('rejects invalid boundaries, cursors and filter values', () => {
    for (const input of [{ startAt: 'bad' }, { startAt: '2026-10-28', endAt: '2026-10-24' }, { cursor: '{}' }, { categories: ['bogus'] }, { traffic: 'bogus' }]) {
      expect(() => buildFlowEventQuery({ limit: 80, ...input }, 'env', 'true')).toThrow();
    }
  });
});

it('preserves watchdog names across summary query aliases', () => {
  for (const alias of ['e', 'e_mix', 'e_trend'] as const) {
    const filter = realTrafficEventSql(alias);
    expect(filter).toContain("'google.tag.fire'");
    expect(filter).toContain(`${alias}.properties->'sarge_test'`);
    expect(filter).toContain(`${alias}.name NOT IN`);
  }
});
