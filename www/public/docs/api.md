# Sarge API Export

Use raw event export to build custom dashboards, reporting jobs, or warehouse imports from Sarge tracking data.

## Endpoint

```http
GET /v2/export/events
Authorization: Bearer sarge_read_...
```

Read tokens are environment-scoped. A token can only read events for the `SiteEnvironment` it belongs to. Server-event and postback credentials cannot read data.

Read tokens are stored as SHA-256 hashes with the `events:read` scope. Rotating a token revokes the prior active read token for that environment.

## Example

```bash
curl -G "https://track.sargetrack.app/v2/export/events" \
  -H "authorization: Bearer sarge_read_..." \
  --data-urlencode "start=2026-06-01T00:00:00.000Z" \
  --data-urlencode "end=2026-07-01T00:00:00.000Z" \
  --data-urlencode "name=purchase.completed" \
  --data-urlencode "limit=100"
```

## Query Fields

| Field | Meaning |
| --- | --- |
| `start` | Optional ISO lower bound for `occurredAt`. |
| `end` | Optional ISO upper bound for `occurredAt`. |
| `name` | Optional exact event name. |
| `source` | Optional source: `browser`, `server`, or `postback`. |
| `sessionId` | Optional exact session ID. |
| `userId` | Optional exact user ID. |
| `limit` | Optional page size. Defaults to `100` and caps at `1000`. |
| `cursor` | Opaque cursor from the previous response. |

## Response

```json
{
  "events": [
    {
      "id": "evt_123",
      "siteId": "site_123",
      "siteEnvironmentId": "env_123_production",
      "source": "browser",
      "name": "purchase.completed",
      "occurredAt": "2026-06-19T12:00:00.000Z",
      "receivedAt": "2026-06-19T12:00:01.000Z",
      "sessionId": "sess_123",
      "userId": "user_123",
      "ref": "summer-campaign",
      "affiliate": "partner-42",
      "attributionExpiresAt": null,
      "url": "https://example.com/checkout",
      "referrer": null,
      "title": "Checkout",
      "properties": {
        "value": 129.99,
        "currency": "USD"
      }
    }
  ],
  "nextCursor": "eyJvY2N1cnJlZEF0IjoiMjAyNi0wNi0xOVQxMjowMDowMC4wMDBaIiwiaWQiOiJldnRfMTIzIn0"
}
```

Events sort by `occurredAt DESC, id DESC`. Send `nextCursor` on the next request to continue paging. It is `null` when there are no more events.

## Status Codes

- `200`: successful export.
- `400`: invalid export query, timestamp, source, limit, or cursor.
- `401`: missing, invalid, or revoked read token.
- `500`: unexpected export failure.

## Notes

- v1 export returns raw stored events only.
- Export responses respect the workspace plan retention window.
- Event properties are the values Sarge stored after ingestion-time privacy controls.
- Create or rotate export tokens from the project credentials panel. The plaintext token is shown once.
