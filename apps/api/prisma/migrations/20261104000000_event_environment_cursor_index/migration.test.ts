import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('builds the complete event cursor index before replacing the shorter index', () => {
  const migration = readFileSync('apps/api/prisma/migrations/20261104000000_event_environment_cursor_index/migration.sql', 'utf8');
  const schema = readFileSync('apps/api/prisma/schema.prisma', 'utf8');
  expect(migration).toContain('ON "Event" ("siteEnvironmentId", "occurredAt", "id")');
  const cleanup = readFileSync('apps/api/prisma/migrations/20261104000100_drop_redundant_event_environment_index/migration.sql', 'utf8');
  expect(migration).toContain('CREATE INDEX CONCURRENTLY');
  expect(cleanup).toContain('DROP INDEX CONCURRENTLY "Event_siteEnvironmentId_occurredAt_idx"');
  // Each concurrent statement needs its own migration, outside a transaction.
  expect(migration.match(/;/g)).toHaveLength(1);
  expect(cleanup.match(/;/g)).toHaveLength(1);
  expect(migration).not.toMatch(/\bBEGIN\b|DROP TABLE|DELETE FROM/);
  expect(schema).toContain('@@index([siteEnvironmentId, occurredAt, id])');
});
