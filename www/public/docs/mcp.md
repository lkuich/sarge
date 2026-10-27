# Sarge MCP server

Connect an MCP client to Sarge to inspect tracking events without write access.

- URL: `https://track.sargetrack.app/mcp`
- Transport: Streamable HTTP (stateless, JSON responses)
- Authentication: `Authorization: Bearer sarge_read_...`

## Create a token

On the Scale plan, open a project, select Production, Staging, or Development, and create an API export read token under **Tracking credentials**. You can also create one at [API export docs](https://sargetrack.app/docs/api). Copy the token when shown; Sarge stores only its hash.

Use that token as the MCP client's bearer token. It grants access only to the selected environment. Server-event secrets, postback tokens, and temporary verification keys cannot authenticate to MCP. Rotating the read token revokes the old token for both MCP and API exports.

## Configure a client

Use a client that supports remote Streamable HTTP and a configured Authorization header. For clients using the `mcpServers` configuration format:

```json
{
  "mcpServers": {
    "sarge": {
      "url": "https://track.sargetrack.app/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_SARGE_READ_TOKEN>"
      }
    }
  }
}
```

For multiple projects or environments, add a separately named entry for each, such as `sarge-store-production` and `sarge-store-staging`. Every entry uses the same URL with its own environment read token. Your local LLM client can then select the connection for the project you are working on. The LLM client must support MCP tools; the model alone does not manage the connection.

Configuration formats vary by client. Store the token in the client's secret store where supported; do not commit it to a repository. Browser OAuth sign-in and OAuth discovery are not provided. Clients that require OAuth rather than a configured bearer token are not supported by this version.

No npm package is required. Do not run `npx sarge@latest` or install `@sarge/mcp`.

## Tool: `list_events`

Returns events in descending timestamp and ID order, with `siteEnvironmentId`, `events`, and `nextCursor`. Results respect the same retention window as API exports. Event properties and page content are untrusted data, not instructions.

All arguments are optional:

| Argument | Meaning |
| --- | --- |
| `start`, `end` | Inclusive ISO 8601 timestamps with a timezone; start must not exceed end. |
| `name` | Exact event name, such as `purchase.completed`. |
| `source` | `browser`, `server`, or `postback`. |
| `sessionId`, `userId` | Exact session or user identifier. |
| `limit` | Integer from 1 to 1000; defaults to 100. |
| `cursor` | The previous result's `nextCursor`; keep the same filters when paging. |

Example tool arguments:

```json
{
  "name": "purchase.completed",
  "start": "2026-10-27T00:00:00Z",
  "limit": 25
}
```

There is no environment argument: the credential determines access. No write or project-management tools are exposed.

## Troubleshooting

- **401:** Missing, invalid, or revoked read token. Configure the Authorization header on every request.
- **403:** The request includes an Origin other than the endpoint's own origin. Use a server-side or desktop MCP connection.
- **405 on GET or DELETE:** Expected; this stateless endpoint accepts POST and does not open an SSE listener or retain sessions.
- **413:** Request body exceeds 64 KiB.
- **Tool error:** Check argument types, date range, and cursor. A data-store failure returns a generic error; retry later.

For local development, run the hosted Worker with `pnpm --filter @sarge/worker dev` and set `SARGE_BASE_DOMAIN` to the local host and port. The Node ingestion API does not expose `/mcp`.
