import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, MessageCircle, RefreshCw, Send, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { changeLabel, type ProjectInsights } from '@/lib/insights';

type Message = { role: 'user' | 'assistant'; content: string };
const questions = ['What changed most this week?', 'How does checkout activity compare with purchases?', 'Are there signs of tracking quality getting worse?'];
const count = (value: number) => value.toLocaleString();

export function InsightsPanel({ environmentId }: { environmentId: string }) {
  const [data, setData] = useState<ProjectInsights>();
  const [loadError, setLoadError] = useState('');
  const [overview, setOverview] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState<'overview' | 'chat' | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const endpoint = `/api/project-insights/${encodeURIComponent(environmentId)}`;

  async function analyze(mode: 'overview' | 'chat', history: Message[] = []) {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(mode);
    setError('');
    if (mode === 'overview') setOverview('');
    else setMessages([...history, { role: 'assistant', content: '' }]);
    let text = '';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, messages: history.map(message => ({ ...message, content: message.content.slice(0, 2000) })) }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error((await response.json()).error || 'AI analysis is unavailable.');
      if (!response.body) throw new Error('No response received.');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let complete = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line) continue;
          const part = JSON.parse(line);
          if (part.error) throw new Error(part.error);
          if (typeof part.text === 'string') {
            text += part.text;
            if (mode === 'overview') setOverview(text);
            else setMessages([...history, { role: 'assistant', content: text }]);
          }
          if (part.done) complete = true;
        }
      }
      if (!complete) throw new Error('The response was interrupted. Please retry.');
    } catch (err) {
      // Incomplete answers must not become evidence in subsequent turns.
      if (mode === 'chat') { setMessages(history.slice(0, -1)); setQuestion(history.at(-1)?.content ?? ''); }
      else setOverview('');
      setError(abort.signal.aborted ? 'Analysis stopped. You can try again.' : err instanceof Error ? err.message : 'AI analysis failed. Please retry.');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    fetch(endpoint, { signal: abort.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Insights could not load.');
      if (abort.signal.aborted) return;
      setData(body);
      if (body.current.eventMix.length || body.previous.eventMix.length) void analyze('overview');
    }).catch(err => { if (!abort.signal.aborted) setLoadError(err.message); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [environmentId]);

  function ask(value: string) {
    if (busy || !value.trim()) return;
    setQuestion('');
    void analyze('chat', [...messages.slice(-10), { role: 'user', content: value.trim() }]);
  }

  if (loadError) return <Card><CardContent className="py-6"><p role="alert" className="text-sm">{loadError}</p><Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>Retry</Button></CardContent></Card>;
  if (!data) return <Card><CardContent className="py-8 text-sm text-muted-foreground" role="status">Loading aggregate trends…</CardContent></Card>;
  const hasData = data.current.eventMix.length > 0 || data.previous.eventMix.length > 0;
  const metrics = [
    ['Tracked events', 'events'], ['Sessions', 'sessions'], ['Checkout sessions', 'checkoutSessions'], ['Purchase sessions', 'purchaseSessions'],
  ] as const;
  const quality = [
    ['Checkout sessions with a purchase', 'checkoutWithPurchase'],
    ['Purchase sessions without observed Meta Purchase', 'purchasesWithoutMeta'],
    ['Order IDs repeated within the period', 'duplicateOrders'],
    ['Events missing required ecommerce properties', 'incompleteEvents'],
  ] as const;
  const eventNames = [...new Set([...data.current.eventMix, ...data.previous.eventMix].map(event => event.name))];
  const maxDaily = Math.max(1, ...data.days.map(day => day.events));

  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-4" /> What changed?</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.midpoint} → {data.end} · 7 complete UTC days, compared with the previous 7.</p>
        <p className="mt-1 text-xs text-muted-foreground">Today is excluded. Test traffic and off-domain events are excluded. AI analysis runs independently of diagnostic findings.</p>
      </div>
      <Button variant="outline" size="sm" disabled={Boolean(busy) || !hasData} onClick={() => void analyze('overview')}><RefreshCw className="size-3.5" /> Analyze again</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, key]) => <Card key={key}><CardContent className="py-4">
      <p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count(data.current[key])}</p>
      <p className="mt-1 text-xs text-muted-foreground">{changeLabel(data.current[key], data.previous[key])}</p>
    </CardContent></Card>)}</div>
    {(data.current.activeDays < 7 || data.previous.activeDays < 7) && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Limited observation: primary events appear on {data.current.activeDays}/7 recent days and {data.previous.activeDays}/7 comparison days. New tracking or quiet days can make comparisons misleading.</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4" /> Worth a closer look</CardTitle></CardHeader>
          <CardContent><div className="whitespace-pre-wrap break-words text-sm leading-6" aria-busy={busy === 'overview'}>{overview || (busy === 'overview' ? 'Looking for changes across both periods…' : hasData ? 'Run an analysis to explore these aggregates.' : 'No events were recorded in this window. There is not enough data to identify trends.')}</div>
            <p className="mt-4 text-xs text-muted-foreground">AI observations are hypotheses to verify, not diagnostic findings.</p>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Daily activity</CardTitle></CardHeader><CardContent>
          <div className="flex h-28 items-end gap-1.5" role="img" aria-label={`Daily tracked event counts: ${data.days.map(day => `${day.date}: ${day.events}`).join(', ')}`}>
            {data.days.map((day, index) => <div key={day.date} className="flex h-full min-w-0 flex-1 items-end" title={`${day.date}: ${count(day.events)} events`}><div className={`w-full rounded-t-sm ${index < 7 ? 'bg-muted-foreground/25' : 'bg-primary/80'}`} style={{ height: `${day.events ? Math.max(2, day.events / maxDaily * 100) : 0}%` }} /></div>)}
          </div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{data.start} · previous</span><span>{data.midpoint} · recent</span></div>
          <p className="mt-3 text-xs text-muted-foreground">Event and session totals exclude pixel-watchdog observations. Sessions require a session ID.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Event mix & tracking quality</CardTitle></CardHeader><CardContent className="overflow-x-auto">
          <table className="w-full text-left text-xs"><caption className="sr-only">Event counts and quality indicators in each seven-day period</caption><thead><tr className="border-b text-muted-foreground"><th className="pb-2 font-medium">Observation</th><th className="pb-2 text-right font-medium">Previous</th><th className="pb-2 pl-3 text-right font-medium">Recent</th></tr></thead><tbody>
            {eventNames.map(name => <tr className="border-b" key={name}><th className="py-2 pr-3 font-normal">{name}</th><td className="text-right tabular-nums">{count(data.previous.eventMix.find(event => event.name === name)?.count ?? 0)}</td><td className="pl-3 text-right tabular-nums">{count(data.current.eventMix.find(event => event.name === name)?.count ?? 0)}</td></tr>)}
            {quality.map(([label, key]) => <tr className="border-b" key={key}><th className="py-2 pr-3 font-normal">{label}</th><td className="text-right tabular-nums">{count(data.previous[key])}</td><td className="pl-3 text-right tabular-nums">{count(data.current[key])}</td></tr>)}
          </tbody></table><p className="mt-3 text-xs leading-5 text-muted-foreground">Custom event names are grouped for privacy. Checkout and purchase counts are same-window observations, not an ordered conversion funnel. Consent, blockers, normal abandonment, and delayed purchases can explain gaps.</p>
        </CardContent></Card>
      </div>
      <Card className="min-w-0 self-start xl:sticky xl:top-4"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><MessageCircle className="size-4" /> Ask your data</CardTitle><p className="text-xs text-muted-foreground">Answers use this environment’s 14-day aggregates. No individual customer records or other date ranges.</p></CardHeader>
        <CardContent className="grid gap-4">
          <div role="log" aria-label="Data conversation" aria-live="polite" aria-relevant="additions" className="grid max-h-[32rem] gap-4 overflow-y-auto">
            {messages.map((message, index) => <div key={index} className={`rounded-md p-3 text-sm ${message.role === 'user' ? 'bg-muted' : 'border'}`}><p className="mb-1 text-xs font-medium text-muted-foreground">{message.role === 'user' ? 'You' : 'Sarge'}</p><div className="whitespace-pre-wrap break-words leading-6">{message.content || 'Thinking…'}</div></div>)}
          </div>
          {!messages.length && <div className="grid gap-2">{questions.map(value => <button key={value} disabled={Boolean(busy)} onClick={() => ask(value)} className="flex items-center justify-between gap-3 rounded-md border p-3 text-left text-xs hover:bg-muted disabled:opacity-50">{value}<ArrowUpRight className="size-3.5 shrink-0" /></button>)}</div>}
          {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">{error}</p>}
          <form onSubmit={event => { event.preventDefault(); ask(question); }} className="grid gap-2">
            <label htmlFor="insights-question" className="text-xs font-medium">Your question</label>
            <textarea id="insights-question" value={question} onChange={event => setQuestion(event.target.value)} rows={3} maxLength={2000} placeholder="What should I investigate next?" className="w-full resize-y rounded-md border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" disabled={Boolean(busy)} />
            <p className="text-xs text-muted-foreground">Questions and recent chat context are sent to OpenAI. Don’t include personal data. Chat is not saved and clears when you leave.</p>
            <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="ghost" disabled={Boolean(busy) || !messages.length} onClick={() => { setMessages([]); setError(''); }}>New chat</Button>
              {busy ? <Button type="button" size="sm" variant="outline" onClick={() => controller.current?.abort()}><Square className="size-3" /> Stop</Button> : <Button type="submit" size="sm" disabled={!question.trim()}><Send className="size-3.5" /> Ask</Button>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>;
}
