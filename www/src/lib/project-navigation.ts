export const projectTabs = [
  { id: 'overview', label: 'Overview', description: 'Traffic, trends, and event mix for this environment.' },
  { id: 'sessions', label: 'Sessions', description: 'Follow users and sessions through your site.' },
  { id: 'events', label: 'Live events', description: 'Inspect incoming events and their captured properties.' },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Review tracking issues and recommended fixes.' },
  { id: 'setup', label: 'Setup', description: 'Install your pixel, test tracking, and connect integrations.' },
  { id: 'settings', label: 'Settings', description: 'Manage privacy and data controls for this project.' },
] as const;

export type ProjectTab = typeof projectTabs[number]['id'];

export const getProjectTab = (value: string | null): ProjectTab =>
  projectTabs.find((tab) => tab.id === value)?.id ?? 'overview';

export const projectTabHref = (siteId: string, environment: string, tab: ProjectTab) => {
  const params = new URLSearchParams();
  if (environment !== 'production') params.set('environment', environment);
  if (tab !== 'overview') params.set('tab', tab);
  const query = params.toString();
  return `/app/projects/${encodeURIComponent(siteId)}${query ? `?${query}` : ''}`;
};
