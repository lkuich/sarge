import type { EventPayload } from "./event-schema.js";

export interface EventRepository {
  createEvent(event: EventPayload): Promise<void>;
}
