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
import { Download, GitBranch, Radio, RefreshCw, Search, UserRound, UsersRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FlowMode = "session" | "user";
type EventFilter = "conversion" | "watchdog" | "page" | "custom";
type TrafficFilter = "real" | "test" | "all";
type TimePreset = "all" | "1h" | "24h" | "7d";

interface FlowEvent {
  id: string;
  name: string;
  occurredAt: string;
  receivedAt: string;
  sessionId: string;
  userId: string;
  url?: string;
  referrer?: string;
  ref?: string;
  affiliate?: string;
  title?: string;
  properties: Record<string, unknown>;
}

interface SessionFlowExplorerProps {
  events: FlowEvent[];
  refreshEndpoint?: string;
  onRefresh?: () => void | Promise<void>;
}

interface FlowGroup {
  id: string;
  label: string;
  events: FlowEvent[];
  lastEventAt: string;
}

interface FlowNodeData extends Record<string, unknown> {
  label: ReactNode;
  kind: "user" | "group" | "event";
  userId?: string;
  groupId?: string;
  eventId?: string;
}

type FlowNode = Node<FlowNodeData>;

const nodeWidth = 210;
const nodeGap = 250;
const pageRowGap = 154;
const groupGap = 96;

export function SessionFlowExplorer({ events, refreshEndpoint, onRefresh }: SessionFlowExplorerProps) {
  const [liveEvents, setLiveEvents] = useState(events);
  const [mode, setMode] = useState<FlowMode>("user");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sargeRefFilter, setSargeRefFilter] = useState("");
  const [sargeAffFilter, setSargeAffFilter] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedEventFilters, setSelectedEventFilters] = useState<EventFilter[]>(() =>
    eventFilters.map((filter) => filter.value),
  );
  const [trafficFilter, setTrafficFilter] = useState<TrafficFilter>("real");
  const [startAt, setStartAt] = useState(() => getDefaultTimeRange(events).startAt);
  const [endAt, setEndAt] = useState(() => getDefaultTimeRange(events).endAt);
  const [hasChosenTimeWindow, setHasChosenTimeWindow] = useState(false);

  const canRefresh = Boolean(refreshEndpoint || onRefresh);
  const trafficFilteredEvents = useMemo(() => filterEventsByTraffic(liveEvents, trafficFilter), [liveEvents, trafficFilter]);
  const sampleBounds = useMemo(() => getSampleBounds(trafficFilteredEvents), [trafficFilteredEvents]);
  const defaultTimeRange = useMemo(() => getPresetTimeRange("1h", sampleBounds.latest), [sampleBounds.latest]);
  const timeFilteredEvents = useMemo(
    () => filterEventsByTime(trafficFilteredEvents, startAt, endAt),
    [endAt, startAt, trafficFilteredEvents],
  );
  const groups = useMemo(() => buildGroups(timeFilteredEvents, mode), [mode, timeFilteredEvents]);
  const filteredGroups = useMemo(
    () => filterGroups(groups, query, selectedEventFilters, { ref: sargeRefFilter, affiliate: sargeAffFilter }),
    [groups, query, selectedEventFilters, sargeAffFilter, sargeRefFilter],
  );
  const visibleGroups = useMemo(() => {
    if (selectedGroupId) return filteredGroups.filter((group) => group.id === selectedGroupId);
    return filteredGroups;
  }, [filteredGroups, selectedGroupId]);
  const { nodes, edges } = useMemo(() => buildFlowElements(visibleGroups, mode), [mode, visibleGroups]);
  const selectedEvent = useMemo(
    () => timeFilteredEvents.find((event) => event.id === selectedEventId) ?? null,
    [timeFilteredEvents, selectedEventId],
  );
  const exportFlowData = () => {
    const generatedAt = new Date().toISOString();

    downloadJsonFile(
      getFlowExportFilename(mode, generatedAt),
      buildFlowExportPayload({
        generatedAt,
        mode,
        query,
        selectedEventFilters,
        sargeRefFilter,
        sargeAffFilter,
        trafficFilter,
        startAt,
        endAt,
        selectedGroupId,
        sampleBounds,
        sourceEventCount: liveEvents.length,
        trafficFilteredEventCount: trafficFilteredEvents.length,
        timeFilteredEventCount: timeFilteredEvents.length,
        groupCount: groups.length,
        filteredGroupCount: filteredGroups.length,
        visibleGroups,
        nodes,
        edges,
      }),
    );
  };
  const refreshFlowData = async () => {
    if (!canRefresh || isRefreshing) return;

    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
        return;
      }

      const response = await fetch(refreshEndpoint ?? "", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Flow refresh failed: ${response.status}`);

      const payload = (await response.json()) as { events?: FlowEvent[] };
      setLiveEvents(Array.isArray(payload.events) ? payload.events : []);
      setSelectedGroupId(null);
      setSelectedEventId(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLiveEvents(events);
  }, [events]);

  useEffect(() => {
    if (hasChosenTimeWindow) return;

    setStartAt(defaultTimeRange.startAt);
    setEndAt(defaultTimeRange.endAt);
  }, [defaultTimeRange.endAt, defaultTimeRange.startAt, hasChosenTimeWindow]);

  useEffect(() => {
    if (selectedGroupId && !filteredGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedEventId && !timeFilteredEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [timeFilteredEvents, selectedEventId]);

  useEffect(() => {
    if (
      selectedEventId &&
      !filteredGroups.some((group) => group.events.some((event) => event.id === selectedEventId))
    ) {
      setSelectedEventId(null);
    }
  }, [filteredGroups, selectedEventId]);

  useEffect(() => {
    if (!selectedEvent) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEventId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  if (liveEvents.length === 0) {
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
            variant={mode === "user" ? "default" : "ghost"}
            type="button"
            aria-pressed={mode === "user"}
            onClick={() => {
              setMode("user");
              setSelectedGroupId(null);
              setSelectedEventId(null);
            }}
          >
            <UsersRound className="size-3.5" />
            User
          </Button>
          <Button
            className="h-7 gap-1.5 rounded-md px-2.5"
            size="sm"
            variant={mode === "session" ? "default" : "ghost"}
            type="button"
            aria-pressed={mode === "session"}
            onClick={() => {
              setMode("session");
              setSelectedGroupId(null);
              setSelectedEventId(null);
            }}
          >
            <GitBranch className="size-3.5" />
            Session
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="size-3.5" />
            {filteredGroups.length} of {groups.length} {mode === "session" ? "sessions" : "users"}
          </div>
          <Button
            className="h-7 gap-1.5 px-2.5"
            size="sm"
            variant="outline"
            type="button"
            disabled={!canRefresh || isRefreshing}
            onClick={refreshFlowData}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button className="h-7 gap-1.5 px-2.5" size="sm" variant="outline" type="button" onClick={exportFlowData}>
            <Download className="size-3.5" />
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-card p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 pr-8"
              value={query}
              placeholder={`Search ${mode === "session" ? "sessions" : "users"}, events, URLs, sarge params`}
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
            {trafficFilters.map((filter) => (
              <Button
                key={filter.value}
                className="h-8"
                size="sm"
                variant={trafficFilter === filter.value ? "default" : "outline"}
                type="button"
                aria-pressed={trafficFilter === filter.value}
                onClick={() => {
                  setTrafficFilter(filter.value);
                  setSelectedGroupId(null);
                  setSelectedEventId(null);
                }}
              >
                {filter.label}
              </Button>
            ))}
            {eventFilters.map((filter) => (
              <Button
                key={filter.value}
                className="h-8"
                size="sm"
                variant={selectedEventFilters.includes(filter.value) ? "default" : "outline"}
                type="button"
                aria-pressed={selectedEventFilters.includes(filter.value)}
                onClick={() => {
                  setSelectedEventFilters((current) => toggleEventFilter(current, filter.value));
                  setSelectedGroupId(null);
                  setSelectedEventId(null);
                }}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(160px,220px)_minmax(160px,220px)_auto] md:items-end">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Ref/Campaign
            <Input
              value={sargeRefFilter}
              placeholder="summer-campaign"
              onChange={(event) => {
                setSargeRefFilter(event.target.value);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Affiliate
            <Input
              value={sargeAffFilter}
              placeholder="partner-42"
              onChange={(event) => {
                setSargeAffFilter(event.target.value);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            />
          </label>
          {(sargeRefFilter || sargeAffFilter) && (
            <Button
              className="h-8 gap-1"
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setSargeRefFilter("");
                setSargeAffFilter("");
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            >
              <X className="size-3.5" />
              Clear sarge params
            </Button>
          )}
        </div>
        <div className="grid gap-2 lg:grid-cols-[auto_minmax(180px,220px)_minmax(180px,220px)_auto] lg:items-end">
          <div className="flex flex-wrap gap-1">
            {timePresets.map((preset) => (
              <Button
                key={preset.value}
                className="h-8"
                size="sm"
                variant={isTimePresetActive(preset.value, startAt, endAt, sampleBounds.latest) ? "default" : "outline"}
                type="button"
                aria-pressed={isTimePresetActive(preset.value, startAt, endAt, sampleBounds.latest)}
                onClick={() => {
                  const range = getPresetTimeRange(preset.value, sampleBounds.latest);
                  setStartAt(range.startAt);
                  setEndAt(range.endAt);
                  setHasChosenTimeWindow(true);
                  setSelectedGroupId(null);
                  setSelectedEventId(null);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Start
            <Input
              type="datetime-local"
              value={startAt}
              min={sampleBounds.earliest ? toDateTimeLocal(sampleBounds.earliest) : undefined}
              max={endAt || (sampleBounds.latest ? toDateTimeLocal(sampleBounds.latest) : undefined)}
              onChange={(event) => {
                setStartAt(event.target.value);
                setHasChosenTimeWindow(true);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            End
            <Input
              type="datetime-local"
              value={endAt}
              min={startAt || (sampleBounds.earliest ? toDateTimeLocal(sampleBounds.earliest) : undefined)}
              max={sampleBounds.latest ? toDateTimeLocal(sampleBounds.latest) : undefined}
              onChange={(event) => {
                setEndAt(event.target.value);
                setHasChosenTimeWindow(true);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            />
          </label>
          {(startAt || endAt) && (
            <Button
              className="h-8 gap-1"
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setStartAt("");
                setEndAt("");
                setHasChosenTimeWindow(true);
                setSelectedGroupId(null);
                setSelectedEventId(null);
              }}
            >
              <X className="size-3.5" />
              Clear dates
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {timeFilteredEvents.length} of {trafficFilteredEvents.length} events
          </Badge>
          <Badge variant="outline">{visibleGroups.length} visible</Badge>
          {sampleBounds.earliest && sampleBounds.latest && (
            <Badge variant="outline">
              Sample {formatDateTime(sampleBounds.earliest)} - {formatDateTime(sampleBounds.latest)}
            </Badge>
          )}
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
        </div>
      </div>

      {selectedEvent && <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEventId(null)} />}
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
  let groupTop = 0;
  const groupX = mode === "session" ? nodeGap : 0;
  const eventX = groupX + nodeGap;
  const groupLayouts = groups.map((group) => {
    const pageSegments = segmentEventsByPageView(group.events);
    const groupNodeY = groupTop + ((pageSegments.length - 1) * pageRowGap) / 2;
    const layout = {
      group,
      pageSegments,
      groupNodeY,
      top: groupTop,
      userId: group.events[0]?.userId ?? group.id,
    };

    groupTop += pageSegments.length * pageRowGap + groupGap;
    return layout;
  });

  if (mode === "session") {
    getUserLayouts(groupLayouts).forEach((userLayout, userId) => {
      const userNodeId = `user:${userId}`;
      const hasTestTraffic = userLayout.groups.some(({ group }) => group.events.some(isTestTraffic));

      nodes.push({
        id: userNodeId,
        type: "input",
        position: { x: 0, y: userLayout.y },
        data: {
          kind: "user",
          userId,
          label: (
            <div className="grid gap-1 text-left">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">User</span>
              <span className="truncate font-mono text-xs">{shortenId(userId)}</span>
              <span className="text-[11px] text-muted-foreground">
                {userLayout.groups.length} {userLayout.groups.length === 1 ? "session" : "sessions"}
              </span>
            </div>
          ),
        },
        style: {
          width: nodeWidth,
          borderColor: hasTestTraffic ? testTrafficBorderColor : "color-mix(in oklch, var(--color-primary) 52%, transparent)",
          background: hasTestTraffic ? testTrafficBackground : "color-mix(in oklch, var(--color-primary) 10%, var(--color-card))",
          color: "var(--color-card-foreground)",
          boxShadow: hasTestTraffic
            ? testTrafficShadow
            : "0 0 0 1px color-mix(in oklch, var(--color-primary) 12%, transparent)",
        },
      });
    });
  }

  groupLayouts.forEach(({ group, pageSegments, groupNodeY, top, userId }) => {
    const groupNodeId = `group:${group.id}`;
    const hasTestTraffic = group.events.some(isTestTraffic);

    nodes.push({
      id: groupNodeId,
      type: mode === "session" ? undefined : "input",
      position: { x: groupX, y: groupNodeY },
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
        borderColor: hasTestTraffic ? testTrafficBorderColor : "color-mix(in oklch, var(--color-primary) 42%, transparent)",
        background: hasTestTraffic ? testTrafficBackground : "var(--color-card)",
        color: "var(--color-card-foreground)",
        boxShadow: hasTestTraffic ? testTrafficShadow : undefined,
      },
    });

    if (mode === "session") {
      const userNodeId = `user:${userId}`;

      edges.push({
        id: `${userNodeId}->${groupNodeId}`,
        source: userNodeId,
        target: groupNodeId,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: hasTestTraffic ? "var(--color-destructive)" : "var(--color-primary)",
          strokeWidth: hasTestTraffic ? 2.5 : 1.8,
        },
      });
    }

    let previousNodeId = groupNodeId;

    pageSegments.forEach((segment, pageIndex) => {
      const y = top + pageIndex * pageRowGap;

      segment.forEach((event, eventIndex) => {
        const nodeId = `event:${event.id}`;
        const isTestEvent = isTestTraffic(event);

        nodes.push({
          id: nodeId,
          position: { x: eventX + eventIndex * nodeGap, y },
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
            borderColor: isTestEvent
              ? testTrafficBorderColor
              : isConversionEvent(event.name)
                ? "color-mix(in oklch, var(--color-success) 48%, transparent)"
                : isWatchdogEvent(event.name)
                  ? "color-mix(in oklch, var(--color-chart-2) 55%, transparent)"
                  : "var(--color-border)",
            background: isTestEvent ? testTrafficBackground : "var(--color-card)",
            color: "var(--color-card-foreground)",
            boxShadow: isTestEvent ? testTrafficShadow : undefined,
          },
        });

        edges.push({
          id: `${previousNodeId}->${nodeId}`,
          source: previousNodeId,
          target: nodeId,
          type: "smoothstep",
          animated: isConversionEvent(event.name),
          markerEnd: { type: MarkerType.ArrowClosed, color: isTestEvent ? "var(--color-destructive)" : undefined },
          style: {
            stroke: isTestEvent
              ? "var(--color-destructive)"
              : isConversionEvent(event.name)
                ? "var(--color-success)"
                : "var(--color-primary)",
            strokeWidth: isTestEvent || isConversionEvent(event.name) ? 2.5 : 1.8,
          },
        });

        previousNodeId = nodeId;
      });
    });
  });

  return { nodes, edges };
};

const buildFlowExportPayload = ({
  generatedAt,
  mode,
  query,
  selectedEventFilters,
  sargeRefFilter,
  sargeAffFilter,
  trafficFilter,
  startAt,
  endAt,
  selectedGroupId,
  sampleBounds,
  sourceEventCount,
  trafficFilteredEventCount,
  timeFilteredEventCount,
  groupCount,
  filteredGroupCount,
  visibleGroups,
  nodes,
  edges,
}: {
  generatedAt: string;
  mode: FlowMode;
  query: string;
  selectedEventFilters: EventFilter[];
  sargeRefFilter: string;
  sargeAffFilter: string;
  trafficFilter: TrafficFilter;
  startAt: string;
  endAt: string;
  selectedGroupId: string | null;
  sampleBounds: { earliest: string | null; latest: string | null };
  sourceEventCount: number;
  trafficFilteredEventCount: number;
  timeFilteredEventCount: number;
  groupCount: number;
  filteredGroupCount: number;
  visibleGroups: FlowGroup[];
  nodes: FlowNode[];
  edges: Edge[];
}) => ({
  schemaVersion: 1,
  generatedAt,
  source: "sarge.user-and-session-flows",
  mode,
  filters: {
    query,
    sargeRef: sargeRefFilter,
    sargeAff: sargeAffFilter,
    traffic: trafficFilter,
    eventCategories: selectedEventFilters,
    startAt,
    endAt,
    focusedGroupId: selectedGroupId,
  },
  sampleBounds,
  counts: {
    sourceEvents: sourceEventCount,
    trafficFilteredEvents: trafficFilteredEventCount,
    timeFilteredEvents: timeFilteredEventCount,
    groups: groupCount,
    filteredGroups: filteredGroupCount,
    visibleGroups: visibleGroups.length,
  },
  visibleGroups: visibleGroups.map((group) => ({
    id: group.id,
    label: group.label,
    lastEventAt: group.lastEventAt,
    eventCount: group.events.length,
    pageSegments: segmentEventsByPageView(group.events).map((segment) => segment.map((event) => event.id)),
    events: group.events.map((event) => ({
      ...event,
      category: getEventFilter(event.name),
      isTestTraffic: isTestTraffic(event),
    })),
  })),
  graph: {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        kind: node.data.kind,
        userId: node.data.userId,
        groupId: node.data.groupId,
        eventId: node.data.eventId,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      animated: edge.animated === true,
    })),
  },
});

const downloadJsonFile = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getFlowExportFilename = (mode: FlowMode, generatedAt: string) =>
  `sarge-flow-${mode}-${generatedAt.replace(/[:.]/g, "-")}.json`;

const getUserLayouts = (
  groupLayouts: {
    group: FlowGroup;
    groupNodeY: number;
    userId: string;
  }[],
) => {
  const userLayouts = new Map<string, { groups: { group: FlowGroup }[]; minY: number; maxY: number; y: number }>();

  groupLayouts.forEach((layout) => {
    const existing = userLayouts.get(layout.userId);

    if (!existing) {
      userLayouts.set(layout.userId, {
        groups: [layout],
        minY: layout.groupNodeY,
        maxY: layout.groupNodeY,
        y: layout.groupNodeY,
      });
      return;
    }

    existing.groups.push(layout);
    existing.minY = Math.min(existing.minY, layout.groupNodeY);
    existing.maxY = Math.max(existing.maxY, layout.groupNodeY);
    existing.y = (existing.minY + existing.maxY) / 2;
  });

  return userLayouts;
};

const segmentEventsByPageView = (events: FlowEvent[]) => {
  const segments: FlowEvent[][] = [];
  let currentSegment: FlowEvent[] = [];

  for (const event of events) {
    if (event.name === "page.view" && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [];
    }

    currentSegment.push(event);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
};

const filterGroups = (
  groups: FlowGroup[],
  query: string,
  selectedEventFilters: EventFilter[],
  sargeFilters: { ref: string; affiliate: string },
) => {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedRefFilter = sargeFilters.ref.trim().toLowerCase();
  const normalizedAffiliateFilter = sargeFilters.affiliate.trim().toLowerCase();
  const selectedFilters = new Set(selectedEventFilters);

  return groups
    .map((group) => {
      const matchingEvents = group.events.filter((event) => {
        const matchesFilter = selectedFilters.has(getEventFilter(event.name));
        if (!matchesFilter) return false;
        const attribution = getSargeAttribution(event);
        if (normalizedRefFilter && !matchesTextFilter(attribution.ref, normalizedRefFilter)) return false;
        if (normalizedAffiliateFilter && !matchesTextFilter(attribution.affiliate, normalizedAffiliateFilter)) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          group.id,
          event.name,
          event.sessionId,
          event.userId,
          event.url,
          event.referrer,
          attribution.ref,
          attribution.affiliate,
          event.title,
          attribution.ref ? `sarge_ref:${attribution.ref}` : undefined,
          attribution.affiliate ? `sarge_aff:${attribution.affiliate}` : undefined,
        ]
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

const matchesTextFilter = (value: string | undefined, normalizedFilter: string) =>
  Boolean(value?.toLowerCase().includes(normalizedFilter));

const filterEventsByTime = (events: FlowEvent[], startAt: string, endAt: string) => {
  const startTime = parseDateTimeLocal(startAt);
  const endTime = parseDateTimeLocal(endAt);

  return events.filter((event) => {
    const eventTime = Date.parse(event.occurredAt);
    if (Number.isNaN(eventTime)) return false;
    if (startTime !== null && eventTime < startTime) return false;
    if (endTime !== null && eventTime > endTime) return false;
    return true;
  });
};

const filterEventsByTraffic = (events: FlowEvent[], trafficFilter: TrafficFilter) => {
  if (trafficFilter === "all") return events;

  return events.filter((event) => (trafficFilter === "test" ? isTestTraffic(event) : !isTestTraffic(event)));
};

const getDefaultTimeRange = (events: FlowEvent[]) => {
  const realTrafficBounds = getSampleBounds(filterEventsByTraffic(events, "real"));

  return getPresetTimeRange("1h", realTrafficBounds.latest);
};

const getSampleBounds = (events: FlowEvent[]) => {
  const times = events
    .map((event) => Date.parse(event.occurredAt))
    .filter((time) => !Number.isNaN(time))
    .sort((left, right) => left - right);

  return {
    earliest: times.length > 0 ? new Date(times[0]).toISOString() : null,
    latest: times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null,
  };
};

const getPresetTimeRange = (preset: TimePreset, latestEventAt: string | null) => {
  if (preset === "all" || !latestEventAt) return { startAt: "", endAt: "" };

  const latestTime = Date.parse(latestEventAt);
  const durationMs = timePresetDurations[preset];
  const startTime = latestTime - durationMs;

  return {
    startAt: toDateTimeLocal(new Date(startTime).toISOString()),
    endAt: "",
  };
};

const isTimePresetActive = (preset: TimePreset, startAt: string, endAt: string, latestEventAt: string | null) => {
  if (preset === "all") return !startAt && !endAt;
  if (!latestEventAt) return false;
  if (endAt) return false;
  return getPresetTimeRange(preset, latestEventAt).startAt === startAt;
};

function EventDetailsModal({ event, onClose }: { event: FlowEvent; onClose: () => void }) {
  const attribution = getSargeAttribution(event);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <div
        className="grid max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-event-detail-title"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p id="flow-event-detail-title" className="truncate font-mono text-sm">
                {event.name}
              </p>
              {isTestTraffic(event) && <Badge variant="secondary">Test</Badge>}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{event.url ?? "No URL recorded"}</p>
          </div>
          <Button className="size-7" size="icon-sm" variant="ghost" type="button" aria-label="Close event details" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-4 overflow-auto p-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Session" value={event.sessionId} />
            <DetailRow label="User" value={event.userId} />
            <DetailRow label="Ref/Campaign" value={attribution.ref ?? "Not captured"} />
            <DetailRow label="Affiliate" value={attribution.affiliate ?? "Not captured"} />
            <DetailRow label="Occurred" value={new Date(event.occurredAt).toLocaleString()} />
            <DetailRow label="Received" value={new Date(event.receivedAt).toLocaleString()} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Properties</p>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs leading-5">
              <code>{JSON.stringify(event.properties, null, 2)}</code>
            </pre>
          </div>
        </div>
        <div className="flex justify-end border-t p-3">
          <Button variant="outline" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
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

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const parseDateTimeLocal = (value: string) => {
  if (!value) return null;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const toDateTimeLocal = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

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

const getSargeAttribution = (event: FlowEvent) => {
  const params = getUrlSearchParams(event.url);

  return {
    ref: event.ref ?? params?.get("sarge_ref") ?? undefined,
    affiliate: event.affiliate ?? params?.get("sarge_aff") ?? undefined,
  };
};

const getUrlSearchParams = (value?: string) => {
  if (!value) return null;

  try {
    return new URL(value).searchParams;
  } catch {
    return null;
  }
};

const isWatchdogEvent = (name: string) =>
  name === "meta.pixel.fire" || name === "google.tag.fire" || name === "data_layer.push";

const isConversionEvent = (name: string) => name.includes("purchase") || name.includes("checkout");

const testTrafficBorderColor = "color-mix(in oklch, var(--color-destructive) 72%, transparent)";
const testTrafficBackground = "color-mix(in oklch, var(--color-destructive) 14%, var(--color-card))";
const testTrafficShadow = "0 0 0 1px color-mix(in oklch, var(--color-destructive) 18%, transparent)";

const getEventFilter = (name: string): EventFilter => {
  if (isConversionEvent(name)) return "conversion";
  if (isWatchdogEvent(name)) return "watchdog";
  if (name === "page.view") return "page";
  return "custom";
};

const isTestTraffic = (event: FlowEvent) => event.properties.sarge_test === true;

const trafficFilters: { value: TrafficFilter; label: string }[] = [
  { value: "real", label: "Real traffic" },
  { value: "test", label: "Test traffic" },
  { value: "all", label: "All traffic" },
];

const eventFilters: { value: EventFilter; label: string }[] = [
  { value: "conversion", label: "Conversion" },
  { value: "page", label: "Page views" },
  { value: "watchdog", label: "Watchdog" },
  { value: "custom", label: "Custom" },
];

const toggleEventFilter = (current: EventFilter[], filter: EventFilter) => {
  const next = current.includes(filter)
    ? current.filter((currentFilter) => currentFilter !== filter)
    : [...current, filter];

  return eventFilters
    .map((eventFilter) => eventFilter.value)
    .filter((eventFilter) => next.includes(eventFilter));
};

const timePresets: { value: TimePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
];

const timePresetDurations: Record<Exclude<TimePreset, "all">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};
