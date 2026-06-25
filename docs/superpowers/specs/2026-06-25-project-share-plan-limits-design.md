# Project Share Plan Limits Design

## Goal

Limit how many people each project can be shared with based on the owning workspace plan, and show those limits consistently on public pricing, billing, and project sharing UI.

## Limits

- Free: 1 shared user per project.
- Starter: 3 shared users per project.
- Growth: 10 shared users per project.
- Scale: unlimited shared users per project.

## Architecture

Add `projectShares` to the existing `PlanLimits` source of truth in `www/src/lib/pricing.ts`. Enforcement belongs in `shareProject` because it is the server-side mutation that creates or updates project invites. The mutation should block only new shares that would exceed the current project limit; updating an existing share should remain allowed.

## UI

The homepage pricing cards and billing plan cards should both list the same share-limit feature point. The project share dialog should show current usage against the plan limit, disable the invite form when the project is at a finite limit, and point users to billing to upgrade.

## Testing

Use the existing source-level Vitest suites for pricing, navigation, and project detail coverage. Add tests before implementation for the new plan limit values, mutation guard hooks, and UI copy.
