import { describe, expect, it } from 'vitest';
import { buildFlowEventQuery, parseEventNameFilter, realTrafficEventSql } from './flow-event-query';

describe('flow query', () => {
  it('matches any event name with bound, case-insensitive literal substrings before pagination', () => {
    const query = buildFlowEventQuery({ limit: 80, eventNames: " Checkout, O'Reilly%, checkout, , ", traffic: 'real', search: 'buyer' }, 'env', 'true');
    expect(query.sql).toContain('(strpos(lower(e.name), $3) > 0 OR strpos(lower(e.name), $4) > 0)');
    expect(query.sql).not.toContain("O'Reilly");
    expect(query.params).toEqual(['env', 'buyer', 'checkout', "o'reilly%", 81]);
    expect(query.sql.indexOf('strpos(lower(e.name)')).toBeLessThan(query.sql.indexOf('), page AS'));
    expect(parseEventNameFilter(' Checkout, PURCHASE, checkout, , ')).toEqual(['checkout', 'purchase']);
    expect(parseEventNameFilter(' , ')).toEqual([]);
    expect(buildFlowEventQuery({ limit: 80, eventNames: ' , ' }, 'env', 'true').sql).not.toContain('strpos(lower(e.name)');
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
