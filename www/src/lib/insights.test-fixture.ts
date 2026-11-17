import type { ProjectInsights } from './insights';

const period = {
  events: 100, sessions: 20, activeDays: 7, checkoutSessions: 5, purchaseSessions: 2,
  checkoutWithPurchase: 2, purchasesWithoutMeta: 1, duplicateOrders: 0, incompleteEvents: 1,
  eventMix: [{ name: 'page.view', count: 100 }],
};
export const insightFixture: ProjectInsights = {
  start: '2026-11-03', midpoint: '2026-11-10', end: '2026-11-17',
  previous: { ...period }, current: { ...period, events: 120 },
  days: Array.from({ length: 14 }, (_, index) => ({ date: `2026-11-${String(index + 3).padStart(2, '0')}`, events: index + 1 })),
};
