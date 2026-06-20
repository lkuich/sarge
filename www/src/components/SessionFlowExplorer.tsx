import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { GitBranch, Radio, Search, UserRound, UsersRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FlowMode = "session" | "user";
type EventFilter = "all" | "conversion" | "watchdog" | "page" | "custom";

interface FlowEvent {
  id: string;
  name: string;
  occurredAt: string;
  receivedAt: string;
  sessionId: string;
  userId: string;
  url?: string;
  referrer?: string;
  title?: string;
  properties: Record<string, unknown>;
}

interface SessionFlowExplorerProps {
  events: FlowEvent[];
}

interface FlowGroup {
  id: string;
  label: string;
  events: FlowEvent[];
  lastEventAt: string;
}

interface FlowNodeData extends Record<string, unknown> {
  label: ReactNode;
  kind: "group" | "event";
  groupId?: string;
  eventId?: string;
}

type FlowNode = Node<FlowNodeData>;

const nodeWidth = 210;
const nodeGap = 250;
const rowGap = 154;

export function SessionFlowExplorer({ events }: SessionFlowExplorerProps) {
  const [mode, setMode] = useState<FlowMode>("session");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");

  const groups = useMemo(() => buildGroups(events, mode), [events, mode]);
  const filteredGroups = useMemo(
    () => filterGroups(groups, query, eventFilter),
    [eventFilter, groups, query],
  );
  const visibleGroups = useMemo(() => {
    if (selectedGroupId) return filteredGroups.filter((group) => group.id === selectedGroupId);
    return filteredGroups;
  }, [filteredGroups, selectedGroupId]);
  const { nodes, edges } = useMemo(() => buildFlowElements(visibleGroups, mode), [mode, visibleGroups]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    if (selectedGroupId && !filteredGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (
      selectedEventId &&
      !filteredGroups.some((group) => group.events.some((event) => event.id === selectedEventId))
    ) {
      setSelectedEventId(null);
    }
  }, [filteredGroups, selectedEventId]);

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Session and user flows will appear after this project receives events.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-muted p-1">
          <Button
            className="h-7 gap-1.5 rounded-md px-2.5"
            size="sm"
            variant={mode === "session" ? "secondary" : "ghost"}
            type="button"
            onClick={() => {
              setMode("session");
              setSelectedGroupId(null);
              setSelectedEventId(null);
            }}
          >
            <GitBranch className="size-3.5" />
            Session
          </Button>
          <Button
            className="h-7 gap-1.5 rounded-md px-2.5"
            size="sm"
            variant={mode === "user" ? "secondary" : "ghost"}
            type="button"
            onClick={() => {
              setMode("user");
              setSelectedGroupId(null);
              setSelectedEventId(null);
            }}
          >
            <UsersRound className="size-3.5" />
            User
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="size-3.5" />
          {filteredGroups.length} of {groups.length} {mode === "session" ? "sessions" : "users"}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-card p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 pr-8"
              value={query}
              placeholder={`Search ${mode === "session" ? "sessions" : "users"}, events, URLs`}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            />
            {query && (
              <button
                className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSelectedGroupId(null);
                  setSelectedEventId(null);
                }}
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <div className="flex flex-wrap gap-1">
            {eventFilters.map((filter) => (
              <Button
                key={filter.value}
                className="h-8"
                size="sm"
                variant={eventFilter === filter.value ? "secondary" : "outline"}
                type="button"
                onClick={() => {
                  setEventFilter(filter.value);
                  setSelectedGroupId(null);
                  setSelectedEventId(null);
                }}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{events.length} events</Badge>
          <Badge variant="outline">{visibleGroups.length} visible</Badge>
          {selectedGroupId && (
            <Button
              className="h-5 gap-1 rounded-full px-2 text-xs"
              size="xs"
              variant="ghost"
              type="button"
              onClick={() => setSelectedGroupId(null)}
            >
              <X className="size-3" />
              Clear focus
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="h-[460px] overflow-hidden rounded-md border bg-background">
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              colorMode="system"
              fitView
              fitViewOptions={{ padding: 0.22 }}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
              className="sarge-session-flow"
              onNodeClick={(_, node) => {
                if (node.data.kind === "group" && node.data.groupId) {
                  setSelectedGroupId(node.data.groupId);
                  setSelectedEventId(null);
                }
                if (node.data.kind === "event" && node.data.eventId) {
                  setSelectedEventId(node.data.eventId);
                }
              }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={3} />
            </ReactFlow>
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
              No matching {mode === "session" ? "sessions" : "users"} in this event sample.
            </div>
          )}
        </div>

        <div className="grid content-start gap-3">
          <button
            className={cn(
              "grid gap-1 rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted",
              !selectedGroupId && "border-primary/40 bg-primary/5",
            )}
            type="button"
            onClick={() => {
              setSelectedGroupId(null);
              setSelectedEventId(null);
            }}
          >
            <span className="font-medium">Matching {mode === "session" ? "sessions" : "users"}</span>
            <span className="text-xs text-muted-foreground">{filteredGroups.length} groups in the current filter</span>
          </button>
          <div className="max-h-[292px] overflow-auto pr-1">
            <div className="grid gap-2">
              {filteredGroups.map((group) => (
                <button
                  key={group.id}
                  className={cn(
                    "grid gap-2 rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted",
                    selectedGroupId === group.id && "border-primary/40 bg-primary/5",
                  )}
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setSelectedEventId(null);
                  }}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-xs">{group.label}</span>
                    <Badge variant="outline">{group.events.length}</Badge>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {mode === "session" ? <GitBranch className="size-3" /> : <UserRound className="size-3" />}
                    Last event {formatTime(group.lastEventAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {selectedEvent && <EventDetails event={selectedEvent} />}
        </div>
      </div>
    </div>
  );
}

const buildGroups = (events: FlowEvent[], mode: FlowMode): FlowGroup[] => {
  const groupsById = new Map<string, FlowEvent[]>();

  for (const event of events) {
    const id = mode === "session" ? event.sessionId : event.userId;
    const groupEvents = groupsById.get(id) ?? [];
    groupEvents.push(event);
    groupsById.set(id, groupEvents);
  }

  return Array.from(groupsById.entries())
    .map(([id, groupEvents]) => {
      const orderedEvents = [...groupEvents].sort(sortByTime);
      const lastEventAt = orderedEvents.at(-1)?.occurredAt ?? new Date(0).toISOString();

      return {
        id,
        label: shortenId(id),
        events: orderedEvents,
        lastEventAt,
      };
    })
    .sort((left, right) => Date.parse(right.lastEventAt) - Date.parse(left.lastEventAt));
};

const buildFlowElements = (groups: FlowGroup[], mode: FlowMode): { nodes: FlowNode[]; edges: Edge[] } => {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  groups.forEach((group, groupIndex) => {
    const y = groupIndex * rowGap;
    const groupNodeId = `group:${group.id}`;

    nodes.push({
      id: groupNodeId,
      type: "input",
      position: { x: 0, y },
      data: {
        kind: "group",
        groupId: group.id,
        label: (
          <div className="grid gap-1 text-left">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">
              {mode === "session" ? "Session" : "User"}
            </span>
            <span className="truncate font-mono text-xs">{group.label}</span>
            <span className="text-[11px] text-muted-foreground">{group.events.length} events</span>
          </div>
        ),
      },
      style: {
        width: nodeWidth,
        borderColor: "color-mix(in oklch, var(--color-primary) 42%, transparent)",
        background: "var(--color-card)",
        color: "var(--color-card-foreground)",
      },
    });

    group.events.forEach((event, eventIndex) => {
      const nodeId = `event:${event.id}`;
      const previousNodeId = eventIndex === 0 ? groupNodeId : `event:${group.events[eventIndex - 1].id}`;

      nodes.push({
        id: nodeId,
        position: { x: nodeGap + eventIndex * nodeGap, y },
        data: {
          kind: "event",
          groupId: group.id,
          eventId: event.id,
          label: (
            <div className="grid gap-1 text-left">
              <span className="truncate font-mono text-xs">{event.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{event.title ?? eventHost(event.url)}</span>
              <span className="text-[11px] text-muted-foreground">{formatTime(event.occurredAt)}</span>
            </div>
          ),
        },
        style: {
          width: nodeWidth,
          borderColor: isConversionEvent(event.name)
            ? "color-mix(in oklch, var(--color-success) 48%, transparent)"
            : isWatchdogEvent(event.name)
              ? "color-mix(in oklch, var(--color-chart-2) 55%, transparent)"
              : "var(--color-border)",
          background: "var(--color-card)",
          color: "var(--color-card-foreground)",
        },
      });

      edges.push({
        id: `${previousNodeId}->${nodeId}`,
        source: previousNodeId,
        target: nodeId,
        type: "smoothstep",
        animated: isConversionEvent(event.name),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: isConversionEvent(event.name) ? "var(--color-success)" : "var(--color-primary)",
          strokeWidth: isConversionEvent(event.name) ? 2.5 : 1.8,
        },
      });
    });
  });

  return { nodes, edges };
};

const filterGroups = (groups: FlowGroup[], query: string, eventFilter: EventFilter) => {
  const normalizedQuery = query.trim().toLowerCase();

  return groups
    .map((group) => {
      const matchingEvents = group.events.filter((event) => {
        const matchesFilter = eventFilter === "all" || getEventFilter(event.name) === eventFilter;
        if (!matchesFilter) return false;
        if (!normalizedQuery) return true;

        return [group.id, event.name, event.sessionId, event.userId, event.url, event.referrer, event.title]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      });

      return {
        ...group,
        events: matchingEvents,
        lastEventAt: matchingEvents.at(-1)?.occurredAt ?? group.lastEventAt,
      };
    })
    .filter((group) => group.events.length > 0);
};

function EventDetails({ event }: { event: FlowEvent }) {
  return (
    <div className="grid gap-3 rounded-md border bg-card p-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm">{event.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{event.url ?? "No URL recorded"}</p>
      </div>
      <div className="grid gap-2 text-xs">
        <DetailRow label="Session" value={event.sessionId} />
        <DetailRow label="User" value={event.userId} />
        <DetailRow label="Occurred" value={new Date(event.occurredAt).toLocaleString()} />
        <DetailRow label="Received" value={new Date(event.receivedAt).toLocaleString()} />
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border bg-muted p-2 text-xs leading-5">
        <code>{JSON.stringify(event.properties, null, 2)}</code>
      </pre>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </div>
  );
}

const sortByTime = (left: FlowEvent, right: FlowEvent) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt);

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

const shortenId = (value: string) => {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const eventHost = (value?: string) => {
  if (!value) return "No URL recorded";

  try {
    return new URL(value).host;
  } catch {
    return value;
  }
};

const isWatchdogEvent = (name: string) =>
  name === "meta.pixel.fire" || name === "google.tag.fire" || name === "data_layer.push";

const isConversionEvent = (name: string) => name.includes("purchase") || name.includes("checkout");

const getEventFilter = (name: string): Exclude<EventFilter, "all"> => {
  if (isConversionEvent(name)) return "conversion";
  if (isWatchdogEvent(name)) return "watchdog";
  if (name === "page.view") return "page";
  return "custom";
};

const eventFilters: { value: EventFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "conversion", label: "Conversion" },
  { value: "page", label: "Page views" },
  { value: "watchdog", label: "Watchdog" },
  { value: "custom", label: "Custom" },
];
