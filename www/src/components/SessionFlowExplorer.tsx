import { useEffect, useMemo, useState } from "react";
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
import { GitBranch, Radio, UserRound, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FlowMode = "session" | "user";

interface FlowEvent {
  id: string;
  name: string;
  occurredAt: string;
  sessionId: string;
  userId: string;
  url?: string;
  title?: string;
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

const nodeWidth = 210;
const nodeGap = 250;
const rowGap = 154;

export function SessionFlowExplorer({ events }: SessionFlowExplorerProps) {
  const [mode, setMode] = useState<FlowMode>("session");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const groups = useMemo(() => buildGroups(events, mode), [events, mode]);
  const visibleGroups = useMemo(() => {
    if (selectedGroupId) return groups.filter((group) => group.id === selectedGroupId);
    return groups.slice(0, 4);
  }, [groups, selectedGroupId]);
  const { nodes, edges } = useMemo(() => buildFlowElements(visibleGroups, mode), [mode, visibleGroups]);

  useEffect(() => {
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

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
            }}
          >
            <UsersRound className="size-3.5" />
            User
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="size-3.5" />
          {events.length} recent events across {groups.length} {mode === "session" ? "sessions" : "users"}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="h-[460px] overflow-hidden rounded-md border bg-background">
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
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            className="sarge-session-flow"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
          </ReactFlow>
        </div>

        <div className="grid content-start gap-2">
          <button
            className={cn(
              "grid gap-1 rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted",
              !selectedGroupId && "border-primary/40 bg-primary/5",
            )}
            type="button"
            onClick={() => setSelectedGroupId(null)}
          >
            <span className="font-medium">Top recent {mode === "session" ? "sessions" : "users"}</span>
            <span className="text-xs text-muted-foreground">Shows up to four flows at once</span>
          </button>
          {groups.slice(0, 8).map((group) => (
            <button
              key={group.id}
              className={cn(
                "grid gap-2 rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted",
                selectedGroupId === group.id && "border-primary/40 bg-primary/5",
              )}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
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

const buildFlowElements = (groups: FlowGroup[], mode: FlowMode): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  groups.forEach((group, groupIndex) => {
    const y = groupIndex * rowGap;
    const groupNodeId = `group:${group.id}`;

    nodes.push({
      id: groupNodeId,
      type: "input",
      position: { x: 0, y },
      data: {
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
