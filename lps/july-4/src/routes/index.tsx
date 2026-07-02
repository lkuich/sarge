import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

const SIGNUP_URL = "https://sargetrack.app/sign-up?ref=july4";

// Offer ends July 7, 2026 at 23:59:59 UTC
const OFFER_END = Date.UTC(2026, 6, 8, 0, 0, 0);

const SETUP_PROMPT = `Add Sarge tracking. Read these docs first:
- https://sargetrack.app/llms.txt
- https://sargetrack.app/docs/install.md
- https://sargetrack.app/docs/events.md

Install this pixel snippet as early as possible in the page:
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?env=XXXXX"></script>

Then emit window.sarge("track", "event.name", properties) for page, product, cart, checkout, and purchase actions. Keep existing Meta, Google, or analytics pixels in place.

After wiring, ask for a temporary verification link like https://sargetrack.app/verify/{siteEnvironmentId}?key={temporaryVerificationKey} and verify the expected events appear in the public Sarge event stream.

Then audit the tracking already on the page — Meta, Google, dataLayer, server-side calls, and partner postbacks — and report any issues you find: purchase or conversion events that never fire, events firing more than once, requests that error or get blocked, and pages that return a non-200 status.

Make sure I give you the full environment ID to replace XXXXX before you start anything.`;

// The Sarge progression stripe mark.
function SargeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} fill="currentColor" aria-hidden>
      <path d="M2 32h6.5L17.3 10H10.8Z" />
      <path d="M14 34h6.5L30.9 8H24.4Z" />
      <path d="M28 36h6.5L46.5 6H40Z" />
    </svg>
  );
}

type EventStatus = "ok" | "dupe" | "missing";

const STREAM: { t: string; name: string; src: string; status: EventStatus }[] = [
  { t: "12:04:02", name: "page.view", src: "sarge", status: "ok" },
  { t: "12:04:11", name: "product.view", src: "gtm", status: "ok" },
  { t: "12:04:39", name: "add_to_cart", src: "meta", status: "ok" },
  { t: "12:05:20", name: "begin_checkout", src: "server", status: "ok" },
  { t: "12:05:57", name: "purchase", src: "meta", status: "ok" },
  { t: "12:05:57", name: "purchase", src: "meta", status: "dupe" },
  { t: "12:06:03", name: "affiliate.postback", src: "partner", status: "missing" },
];

function StreamRow({
  event,
  index,
}: {
  event: (typeof STREAM)[number];
  index: number;
}) {
  const flagged = event.status !== "ok";
  return (
    <div
      className="lp-reveal grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 font-mono text-xs sm:px-4"
      style={{ animation: `lpFadeUp 0.5s ease both`, animationDelay: `${index * 90}ms` }}
    >
      <span className="tabular-nums text-muted-foreground">{event.t}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={
            "size-1.5 shrink-0 rounded-full " +
            (event.status === "ok"
              ? "bg-emerald-400"
              : event.status === "dupe"
                ? "bg-usa-red"
                : "bg-amber-400")
          }
        />
        <span className={"truncate " + (flagged ? "text-foreground" : "text-foreground/90")}>
          {event.name}
        </span>
      </span>
      {event.status === "ok" ? (
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {event.src}
        </span>
      ) : (
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
            (event.status === "dupe"
              ? "bg-usa-red/15 text-usa-red"
              : "bg-amber-400/15 text-amber-300")
          }
        >
          {event.status === "dupe" ? "×2 duplicate" : "missing"}
        </span>
      )}
    </div>
  );
}

function EventStreamCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-card/70 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-xs font-medium text-foreground/80">live event stream</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          env · prod
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {STREAM.map((event, i) => (
          <StreamRow key={`${event.name}-${i}`} event={event} index={i} />
        ))}
      </div>
      <div className="border-t border-white/10 bg-usa-red/5 px-3 py-2.5 text-[11px] text-muted-foreground sm:px-4">
        <span className="font-semibold text-usa-red">2 issues flagged</span> — purchase fired
        twice, one affiliate postback never arrived.
      </div>
    </div>
  );
}

function Index() {
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = now === null ? 0 : Math.max(0, OFFER_END - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const expired = now !== null && remaining === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <main className="lp-bg relative min-h-screen text-foreground">
      {/* Flag accent */}
      <div className="h-1 w-full bg-usa-red" />
      <div className="h-1 w-full bg-usa-blue" />

      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        {/* Brand header */}
        <header className="mb-8 flex items-center justify-between">
          <a href="https://sargetrack.app/" className="flex items-center gap-2.5" aria-label="Sarge home">
            <SargeMark className="h-6 w-auto text-foreground" />
            <span className="text-lg font-semibold tracking-tight">Sarge</span>
            <span className="rounded-sm border border-usa-blue/40 bg-usa-blue/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-usa-blue">
              BETA
            </span>
          </a>
          <a
            href="https://sargetrack.app/sign-in"
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </a>
        </header>

        {/* Ribbon */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-usa-red/40 bg-usa-red/10 px-3 py-1.5 text-xs font-semibold text-usa-red">
          <span aria-hidden>🇺🇸</span>
          <span>July 4th offer · 2 months free · July 4–7 only</span>
        </div>

        <h1 className="text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          2 months of Sarge{" "}
          <span className="whitespace-nowrap text-usa-blue">Starter — free.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          For affiliate and performance marketers who can't afford to guess whether their
          tracking actually fired. One prompt installs Sarge{" "}
          <span className="text-foreground">and audits what's already broken</span> — no
          card, cancel anytime.
        </p>

        {/* Value stamp */}
        <div className="mt-5 inline-flex items-baseline gap-2 rounded-lg border border-dashed border-usa-red/60 bg-usa-red/5 px-3 py-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-usa-red">
            $70 value
          </span>
          <span className="text-sm text-muted-foreground">
            <span className="line-through">$70.00</span>{" "}
            <span className="font-bold text-foreground">FREE</span> — 2 months of Starter
          </span>
        </div>

        {/* Event stream diagram — the actual Sarge view, not a stock photo */}
        <div className="mt-8">
          <EventStreamCard />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            The audit you get on day one: every event, in order, with the mess flagged.
          </p>
        </div>

        {/* Countdown */}
        <div className="mt-8 rounded-xl border border-white/10 bg-card/60 p-4 backdrop-blur">
          <div className="font-mono text-xs font-semibold uppercase tracking-wide text-usa-red">
            {expired ? "Offer ended" : "2 free months — offer closes in"}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { v: days, l: "Days" },
              { v: hours, l: "Hours" },
              { v: minutes, l: "Min" },
              { v: seconds, l: "Sec" },
            ].map((u) => (
              <div
                key={u.l}
                className="rounded-lg border border-usa-blue/25 bg-usa-blue/10 px-2 py-3"
              >
                <div className="font-mono text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {String(u.v).padStart(2, "0")}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {u.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={SIGNUP_URL}
            className="inline-flex items-center justify-center rounded-lg bg-usa-red px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-usa-red/25 transition hover:brightness-110"
          >
            Claim 2 months free →
          </a>
          <span className="text-sm text-muted-foreground">
            Offer ends July 7 · apply code{" "}
            <code className="rounded bg-usa-blue/15 px-1.5 py-0.5 font-mono font-semibold text-usa-blue">
              LAUNCHDAY
            </code>{" "}
            at checkout.
          </span>
        </div>

        {/* Problem */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Broken tracking quietly torches real ad spend.
          </h2>
          <p className="mt-3 text-muted-foreground">
            One malformed pixel. One silent 500. One partner postback that stopped firing
            last Tuesday — and you're optimizing against a lie. Meta reports "great ROAS,"
            your bank statement disagrees. Then comes the 5pm-Friday Slack ping:{" "}
            <em className="text-foreground/90">"why don't conversions match the order sheet?"</em>
          </p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {[
              "Purchases the ad platform never saw",
              "Events firing twice, quietly doubling your CPA",
              "Affiliate conversions stuck in postback limbo",
              "Landing pages that started 404'ing at 2am",
              "Staging traffic bleeding into your production numbers",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono text-usa-red">✕</span>
                <span className="text-foreground/85">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Solution */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">What Sarge actually is</h2>
          <p className="mt-3 text-muted-foreground">
            A dumb pixel — with tricks. It fires its own first-party events, then watches
            everything else on the page: Meta, Google, your dataLayer, server-side calls,
            partner postbacks, affiliate tracking. You get one honest feed of what fired,
            in what order, and exactly what data rode along with it.
          </p>
          <ol className="mt-5 space-y-3">
            {[
              ["Install", "one hosted script, or paste our prompt into Claude Code or Cursor and let it wire itself in."],
              ["Watch", "Sarge records your first-party events and observes every Meta, Google, and dataLayer call on the page."],
              ["Verify", "a live event stream and a shareable verify link show exactly what fired, so missing purchases, double-fires, and downed pages jump out in seconds."],
              ["Fix", "hand the evidence straight to your coding agent and ship the fix the same afternoon."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-usa-blue/30 bg-usa-blue/10 font-mono text-xs font-semibold text-usa-blue">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground/85">
                  <strong className="font-semibold text-foreground">{title}</strong> — {body}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm text-muted-foreground">
            Want Sarge to run those checks on a schedule and ping you the moment something
            breaks? That's Growth — but the honest event feed above is yours on Starter.
          </p>
        </section>

        {/* Why Starter */}
        <section className="mt-14 rounded-xl border border-usa-blue/25 bg-usa-blue/[0.07] p-5 backdrop-blur">
          <h2 className="text-xl font-semibold tracking-tight text-usa-blue sm:text-2xl">
            $70 of Sarge — on the house
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Two full months of our Starter plan, yours free. Here's what's inside:
          </p>
          <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
            {[
              "3 projects",
              "3 shared users / project",
              "250k events / month",
              "30-day retention",
              "Server-side event calls",
              "Partner postbacks",
              "3 webhooks",
              "Live event stream + verify link",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-foreground/85">
                <span className="font-mono text-usa-blue">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Two months on the house. If Sarge doesn't earn its keep, walk away — you never
            entered a card.
          </p>
        </section>

        {/* Setup snippet */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            One prompt: install Sarge <span className="text-usa-blue">and</span> audit what's
            already broken
          </h2>
          <p className="mt-3 text-muted-foreground">
            Paste this into Claude Code, Cursor, or your agent of choice. Sarge wires itself
            in, then checks the tracking you already have — surfacing missing purchases,
            double-fires, and dead postbacks before you spend another dollar. No ticket to
            your dev team required.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-card/60 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 sm:px-4">
              <span className="font-mono text-xs text-muted-foreground">sarge-setup.prompt</span>
              <button
                onClick={copy}
                className="rounded-md bg-usa-blue px-2.5 py-1 text-xs font-medium text-white transition hover:brightness-110"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground/85">
              <code className="font-mono">{SETUP_PROMPT}</code>
            </pre>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-14 overflow-hidden rounded-2xl border border-usa-blue/30 bg-linear-to-br from-usa-blue/20 via-card/60 to-usa-red/10 p-6 backdrop-blur sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            $70 of tracking. Zero dollars out.
          </h2>
          <p className="mt-3 text-muted-foreground">
            2 months of Starter, free. Offer closes July 7. No credit card. No risky install.
          </p>
          <a
            href={SIGNUP_URL}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-usa-red px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-usa-red/25 transition hover:brightness-110"
          >
            Claim my 2 months free →
          </a>
          <p className="mt-4 text-xs text-muted-foreground">
            Offer valid July 4–7 for new accounts. Apply code{" "}
            <span className="font-mono font-semibold text-foreground">LAUNCHDAY</span> at
            checkout — cancel anytime with one click.
          </p>
        </section>

        <footer className="mt-14 flex items-center gap-2 border-t border-white/10 pt-6 text-sm text-muted-foreground">
          <SargeMark className="h-4 w-auto text-muted-foreground" />
          <a href="https://sargetrack.app/" className="transition hover:text-foreground">
            sargetrack.app
          </a>
          <span className="text-white/20">·</span>
          <a href="https://sargetrack.app/docs" className="transition hover:text-foreground">
            Docs
          </a>
          <span className="text-white/20">·</span>
          <a href="https://sargetrack.app/sign-in" className="transition hover:text-foreground">
            Sign in
          </a>
        </footer>
      </div>
    </main>
  );
}
