import { describe, expect, it } from 'vitest';
import { analyzeEvents, buildTrackedPageFinding, ecommerceTrackingPlan } from '@sarge/core';
import { diagnosticChecks } from './diagnostic-checks';

describe('diagnostic check catalog', () => {
  it('covers every event rule and its current severity, including the checkout caveat', () => {
    const event = (name: string, sessionId = 'a', properties = {}) => ({ name, sessionId, properties, occurredAt: '2026-11-17T00:00:00Z', userId: '' });
    const findings = [
      ...analyzeEvents([event('checkout.started')]),
      ...analyzeEvents([event('purchase.completed', 'a', { order_id: 'one' }), event('purchase.completed', 'a', { order_id: 'one' })]),
      ...analyzeEvents([event('purchase.completed')]),
      ...analyzeEvents([event('meta.pixel.fire', 'a', { event_name: 'Purchase' })]),
    ];
    expect(new Set(findings.map(f => f.id)).size).toBe(6);
    for (const finding of findings) expect(diagnosticChecks).toContainEqual(expect.objectContaining({ id: finding.id, severity: finding.severity }));
    expect(diagnosticChecks[0].condition).toContain('Normal abandonment');
    const required = diagnosticChecks.find(check => check.id === 'missing-required-properties')!;
    for (const event of ecommerceTrackingPlan.events) for (const property of event.requiredProperties ?? []) expect(required.condition).toContain(property);
  });

  it('covers the five page-health rules, including critical server errors', () => {
    const results = [
      { status: 404 }, { status: 500 }, { error: 'timeout' as const }, { error: 'network' as const }, { finalUrl: 'https://elsewhere.example' },
    ];
    for (const result of results) {
      const finding = buildTrackedPageFinding({ url: 'https://shop.example', ...result })!;
      expect(diagnosticChecks.find(check => check.id === finding.ruleId)?.severity).toContain(finding.severity);
    }
    expect(buildTrackedPageFinding({ url: 'https://shop.example', status: 500, eventCount: 10 })?.severity).toBe('critical');
    expect(diagnosticChecks).toHaveLength(11);
  });
});
