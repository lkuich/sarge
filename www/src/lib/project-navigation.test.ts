import { describe, expect, it } from 'vitest';
import { getProjectTab, projectTabHref, projectTabs } from './project-navigation';

describe('project navigation', () => {
  it('defaults missing or unknown tabs to the overview', () => {
    expect(getProjectTab(null)).toBe('overview');
    expect(getProjectTab('unknown')).toBe('overview');
    for (const tab of projectTabs) expect(getProjectTab(tab.id)).toBe(tab.id);
  });

  it('preserves the selected tab when changing environments and returning from forms', () => {
    expect(projectTabHref('site_1', 'production', 'overview')).toBe('/app/projects/site_1');
    expect(projectTabHref('site_1', 'staging', 'sessions')).toBe('/app/projects/site_1?environment=staging&tab=sessions');
    expect(projectTabHref('site_1', 'production', 'setup')).toBe('/app/projects/site_1?tab=setup');
    expect(projectTabHref('site_1', 'development', 'settings')).toBe('/app/projects/site_1?environment=development&tab=settings');
  });
});
