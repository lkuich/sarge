import type { EventPayload } from "@sarge/core";

export interface EventRepository {
  createEvent(event: EventPayload): Promise<void>;
}
