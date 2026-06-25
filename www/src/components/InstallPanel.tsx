import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

interface InstallPanelProps {
  title?: string;
  description?: string;
  prompt?: string;
}

const DEFAULT_AGENT_PROMPT =
  `Add Sarge tracking. Read these docs first: - https://sargetrack.app/llms.txt - https://sargetrack.app/docs/install.md - https://sargetrack.app/docs/events.md Install this pixel snippet as early as possible in the page: <script> window._sarge = { queue: [["track", "page.view"]] }; </script> <script async src="https://track.sargetrack.app/pixel.js?env=XXXXX"></script> Then emit window.sarge("track", "event.name", properties) for page, product, cart, checkout, and purchase actions. Keep existing Meta, Google, or analytics pixels in place. After wiring, open https://sargetrack.app/verify/site_XXXXX and verify the expected events appear in the public Sarge event stream. Make sure I give you the full site ID to replace site_XXXXX before you start anything.`;

const CLAUDE_ORANGE = "#D97757";

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-claude-icon
      className={`inline-block ${className ?? ""}`}
      style={{
        backgroundColor: "currentColor",
        maskImage: "url('/claude.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/claude.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
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
  const { copied, copy } = useCopied();

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
        <button
          type="button"
          onClick={handlePrimary}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-none px-3 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: CLAUDE_ORANGE }}
        >
          <ClaudeIcon className="size-4" />
          {copied === "primary" ? "Copied" : "Copy setup prompt"}
        </button>
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
