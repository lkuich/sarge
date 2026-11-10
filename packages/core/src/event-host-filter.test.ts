import { describe, expect, it } from 'vitest';
import { eventMatchesConfiguredHost } from './event-host-filter.js';

describe('tracked website host filtering', () => {
  it.each(['storypane.dev', 'sarge.storypane.dev', 'www.sarge.storypane.dev'])(
    'matches page URLs for a project configured as %s', (configured) => {
      expect(eventMatchesConfiguredHost({ url: 'https://storypane.dev/#customize' }, configured)).toBe(true);
      expect(eventMatchesConfiguredHost({ url: 'https://www.storypane.dev:443/docs/' }, configured)).toBe(true);
      expect(eventMatchesConfiguredHost({ referrer: 'https://storypane.dev/' }, configured)).toBe(true);
      expect(eventMatchesConfiguredHost({}, configured)).toBe(true);
      expect(eventMatchesConfiguredHost({ url: 'http://localhost:4321/' }, configured)).toBe(false);
      expect(eventMatchesConfiguredHost({ url: 'https://preview.storypane.dev/' }, configured)).toBe(false);
      expect(eventMatchesConfiguredHost({ url: 'https://sarge.storypane.dev/' }, configured)).toBe(false);
      expect(eventMatchesConfiguredHost({ url: 'https://other.example/', referrer: 'https://storypane.dev/' }, configured)).toBe(false);
    },
  );
  it('keeps real site subdomains and missing configuration distinct', () => {
    expect(eventMatchesConfiguredHost({ url: 'https://shop.example.com/' }, 'sarge.shop.example.com')).toBe(true);
    expect(eventMatchesConfiguredHost({ url: 'https://example.com/' }, 'sarge.shop.example.com')).toBe(false);
    expect(eventMatchesConfiguredHost({ url: 'https://storypane.dev/' }, null)).toBe(false);
  });
});
