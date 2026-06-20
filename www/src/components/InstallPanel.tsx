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

const AGENT_LABELS: Record<AgentKey, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

const SKILL_CMD = "npx sarge@latest skill install";

const MCP_CMD: Record<AgentKey, string> = {
  "claude-code": "claude mcp add sarge -- npx -y @sarge/mcp",
  codex: "codex mcp add sarge -- npx -y @sarge/mcp",
  cursor: "cursor mcp add sarge -- npx -y @sarge/mcp",
};

const AGENT_PROMPT =
  "Use the Sarge install skill to add tracking to this app: wire page, product, cart, checkout, and purchase events, keep any existing Meta and Google pixels in place, then verify the events reach the Sarge portal.";

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

function StepHeading({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-5 place-items-center rounded-md border bg-muted font-mono text-[0.65rem]">
        {index}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function CommandRow({
  index,
  label,
  command,
  copied,
  onCopy,
}: {
  index: number;
  label: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <StepHeading index={index} label={label} />
      <div className="mt-2 flex items-center gap-2 rounded-md border bg-background/60 px-3 py-2">
        <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs">{command}</code>
        <CopyButton label={`Copy: ${label}`} copied={copied} onCopy={onCopy} />
      </div>
    </div>
  );
}

export default function InstallPanel() {
  const [agent, setAgent] = useState<AgentKey>("claude-code");
  const { copied, copy } = useCopied();

  const isClaude = agent === "claude-code";

  const handlePrimary = () => {
    copy("primary", `${SKILL_CMD}\n${MCP_CMD[agent]}`);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="size-4 text-primary" />
          Set up Sarge
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
              {copied === "primary" ? "Copied" : `Open in ${AGENT_LABELS[agent]}`}
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

      <div className="space-y-4 p-4">
        <CommandRow
          index={1}
          label="Install the skill"
          command={SKILL_CMD}
          copied={copied === "skill"}
          onCopy={() => copy("skill", SKILL_CMD)}
        />
        <CommandRow
          index={2}
          label="Add the MCP"
          command={MCP_CMD[agent]}
          copied={copied === "mcp"}
          onCopy={() => copy("mcp", MCP_CMD[agent])}
        />
        <div>
          <StepHeading index={3} label="Prompt your agent" />
          <div className="mt-2 flex items-start gap-2 rounded-md border bg-background/60 px-3 py-2">
            <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{AGENT_PROMPT}</p>
            <CopyButton label="Copy prompt" copied={copied === "prompt"} onCopy={() => copy("prompt", AGENT_PROMPT)} />
          </div>
        </div>
      </div>
    </div>
  );
}
