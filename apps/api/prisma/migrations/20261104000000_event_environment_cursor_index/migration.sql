-- Match the timestamp/id ordering so bounded event reads can stop at LIMIT.
CREATE INDEX CONCURRENTLY "Event_siteEnvironmentId_occurredAt_id_idx"
ON "Event" ("siteEnvironmentId", "occurredAt", "id");
