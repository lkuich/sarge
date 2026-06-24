# Dedicated Hosted Sarge

Dedicated hosted Sarge is a managed "Contact us" option for teams that need stronger infrastructure isolation, custom deployment requirements, or hands-on tracking support.

## Who This Is For

Dedicated hosting is for teams that need one or more of:

- dedicated infrastructure
- dedicated database
- custom data retention
- custom region
- strict customer data boundaries
- private networking
- compliance review
- higher support expectations
- custom tracking/debugging implementation help

Most teams should start with standard hosted Sarge. Dedicated hosting is for organizations with privacy, scale, procurement, or operational requirements that do not fit shared infrastructure.

## What Is Included

- dedicated Sarge API deployment
- dedicated Postgres database, preferably a separate Neon project unless customer requirements point elsewhere
- custom event endpoint
- customized pixel URL
- managed migrations and upgrades
- implementation support
- monitoring and operational support
- optional custom domain setup

Example endpoint:

```text
https://events.customer.com
```

Example pixel:

```html
<script src="https://events.customer.com/pixel.js"></script>
<script>
  sarge('init');
  sarge('track', 'PageView');
</script>
```

## Contact Us Intake

Teams interested in dedicated hosting should provide:

- company name
- expected monthly event volume
- number of sites/apps
- preferred region
- required retention window
- custom domain needs
- data sensitivity or compliance requirements
- implementation timeline
- current tracking stack
- required destinations or debugging targets

## Pricing Direction

Dedicated hosting should be custom priced because infrastructure, support, and compliance needs vary by customer.

Pricing drivers:

- event volume
- retention period
- database size
- number of sites/apps
- region requirements
- support level
- custom domains
- implementation services

## Boundaries

Dedicated hosting does not mean every feature is custom-built. The core product remains the same Sarge API, pixel, and event model. Dedicated plans customize infrastructure, operations, retention, support, and implementation assistance.

## Migration Path

A team can move from standard hosted Sarge to dedicated hosting when:

- shared infrastructure is no longer acceptable
- event volume requires isolated capacity
- procurement requires stricter operational controls
- the team wants a custom domain and dedicated data plane

The migration should preserve event names and installation snippets where possible. For hosted projects, keep each Production, Staging, and Development environment mapped to its own tracking ID and event stream.
