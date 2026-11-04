import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    const sql = Object.assign((parts: TemplateStringsArray, ...values: unknown[]) => {
      const text = parts.reduce((text, part, index) => text + part + (
        index < values.length ? (values[index] as { text?: string })?.text ?? '?' : ''
      ), '');
      return { text, values, then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => database.query(text, values).then(resolve, reject) };
    }, {
      unsafe: (text: string) => ({ text }),
      transaction: (queries: (sql: unknown) => unknown[]) => database.transaction(queries(sql)),
    });
    return sql;
  },
}));

import { runScheduledMaintenance } from './data-maintenance';

const request = { id: 'request_1', scope: 'site', targetWorkspaceId: 'workspace_1', targetSiteId: 'site_1', startedAt: '2026-11-04 00:00:00' };
const transactionText = (queries: { text: string }[]) => queries.map(({ text }) => text).join('\n');

beforeEach(() => {
  database.query.mockReset().mockResolvedValue([]);
  database.transaction.mockReset().mockResolvedValue([[], [{ count: 0 }]]);
});

describe('scheduled data maintenance', () => {
  it('purges a bounded batch even when no deletion requests exist', async () => {
    database.transaction.mockResolvedValue([[], [{ count: 17 }]]);
    await expect(runScheduledMaintenance('postgres://test')).resolves.toEqual({ completed: 0, failed: 0, batches: 0, expiredEvents: 17 });
    const queries = database.transaction.mock.calls[0][0];
    expect(transactionText(queries)).toContain(`w."planId" IN ('free', 'starter', 'growth')`);
    expect(queries[1].values).toContain(5000);
  });

  it('counts completed work only after the cleanup transaction succeeds', async () => {
    database.query.mockResolvedValueOnce([request]).mockResolvedValueOnce([]);
    database.transaction.mockResolvedValueOnce([[{ status: 'completed' }]]).mockResolvedValueOnce([[], [{ count: 2 }]]);
    await expect(runScheduledMaintenance('postgres://test')).resolves.toEqual({ completed: 1, failed: 0, batches: 1, expiredEvents: 2 });
    const cleanup = transactionText(database.transaction.mock.calls[0][0]);
    expect(cleanup).toContain('"startedAt" = ?::timestamp');
    expect(cleanup).toContain('"stripeSubscriptionId" IS NOT NULL');
    expect(cleanup.indexOf('DELETE FROM "DiagnosticFinding"')).toBeLessThan(cleanup.indexOf('DELETE FROM "DiagnosticRun"'));
  });

  it('bounds large deletion requests to ten batches and leaves unfinished work pending', async () => {
    database.query.mockResolvedValue([request]);
    database.transaction.mockImplementation(async (queries: { text: string }[]) => transactionText(queries).includes('WITH expired AS')
      ? [[], [{ count: 0 }]] : [[{ status: 'pending' }]]);
    await expect(runScheduledMaintenance('postgres://test')).resolves.toEqual({ completed: 0, failed: 0, batches: 10, expiredEvents: 0 });
    expect(database.query).toHaveBeenCalledTimes(10);
  });

  it('records transaction failure against the same claim and still runs retention', async () => {
    database.query.mockResolvedValueOnce([request]).mockResolvedValue([]);
    database.transaction.mockRejectedValueOnce(new Error('statement timeout')).mockResolvedValueOnce([[], [{ count: 0 }]]);
    await expect(runScheduledMaintenance('postgres://test')).resolves.toEqual({ completed: 0, failed: 1, batches: 0, expiredEvents: 0 });
    const [query, values] = database.query.mock.calls[1];
    expect(query).toContain("SET status = 'failed'");
    expect(values).toContain('statement timeout');
    expect(values).toContain(request.startedAt);
  });

  it('rejects malformed targets before issuing destructive queries', async () => {
    database.query.mockResolvedValueOnce([{ ...request, targetSiteId: null }]).mockResolvedValue([]);
    await expect(runScheduledMaintenance('postgres://test')).resolves.toEqual({ completed: 0, failed: 1, batches: 0, expiredEvents: 0 });
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(transactionText(database.transaction.mock.calls[0][0])).toContain('WITH expired AS');
  });
});
