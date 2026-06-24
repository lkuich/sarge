import { useState, type CSSProperties } from "react";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AgentKey = "claude-code" | "codex" | "cursor";

interface InstallPanelProps {
  title?: string;
  description?: string;
  prompt?: string;
}

const AGENT_LABELS: Record<AgentKey, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

const DEFAULT_AGENT_PROMPT =
  "Add Sarge tracking to this app. Read https://sargetrack.app/llms.txt first, then use https://sargetrack.app/docs/install.md and https://sargetrack.app/docs/events.md as the implementation reference. Install the pixel snippet, wire page, product, cart, checkout, and purchase events, keep any existing Meta and Google pixels in place, then verify the events reach the Sarge portal.";

const CLAUDE_ORANGE = "#D97757";

const CLAUDE_RAYS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 * Math.PI) / 180;
  const inner = 2.6;
  const outer = i % 2 === 0 ? 9 : 6.6;
  return {
    x1: 12 + inner * Math.cos(angle),
    y1: 12 + inner * Math.sin(angle),
    x2: 12 + outer * Math.cos(angle),
    y2: 12 + outer * Math.sin(angle),
  };
});

function ClaudeMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      {CLAUDE_RAYS.map((ray, i) => (
        <line
          key={i}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
  };
  return { copied, copy };
}

function CopyButton({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export default function InstallPanel({
  title = "Set up Sarge",
  description = "Copy these instructions into your coding agent to wire Sarge tracking.",
  prompt = DEFAULT_AGENT_PROMPT,
}: InstallPanelProps) {
  const [agent, setAgent] = useState<AgentKey>("claude-code");
  const { copied, copy } = useCopied();

  const isClaude = agent === "claude-code";

  const handlePrimary = () => {
    copy("primary", prompt);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="size-4 text-primary" />
            {title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="inline-flex">
          {isClaude ? (
            <button
              type="button"
              onClick={handlePrimary}
              className="inline-flex h-8 items-center gap-1.5 rounded-none px-3 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: CLAUDE_ORANGE }}
            >
              <ClaudeMark className="size-4" />
              {copied === "primary" ? "Copied" : "Open in Claude Code"}
            </button>
          ) : (
            <Button onClick={handlePrimary} className="rounded-r-none">
              {copied === "primary" ? "Copied" : `Copy for ${AGENT_LABELS[agent]}`}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Choose your coding agent"
              className={
                isClaude
                  ? "inline-flex h-8 items-center justify-center rounded-none border-l border-black/15 px-2 text-white transition hover:opacity-90"
                  : cn(
                      buttonVariants({ variant: "default" }),
                      "rounded-l-none border-l border-l-primary-foreground/20 px-2",
                    )
              }
              style={isClaude ? { backgroundColor: CLAUDE_ORANGE } : undefined}
            >
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(AGENT_LABELS) as AgentKey[]).map((key) => (
                <DropdownMenuItem key={key} onClick={() => setAgent(key)}>
                  {key === "claude-code" ? (
                    <ClaudeMark className="size-4" style={{ color: CLAUDE_ORANGE }} />
                  ) : null}
                  {AGENT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2 rounded-md border bg-background/60 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{prompt}</p>
          <CopyButton label="Copy prompt" copied={copied === "prompt"} onCopy={() => copy("prompt", prompt)} />
        </div>
      </div>
    </div>
  );
}
