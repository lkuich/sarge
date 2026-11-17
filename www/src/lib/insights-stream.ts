import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { insightsInstructions, type ProjectInsights } from './insights';

export const insightRequestSchema = z.object({
  mode: z.enum(['overview', 'chat']),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  }).strict()).max(12).default([]),
}).strict().refine(value => value.mode === 'overview' || value.messages.at(-1)?.role === 'user', {
  message: 'Chat requires a question.',
});

export function streamInsights(
  data: ProjectInsights,
  input: z.infer<typeof insightRequestSchema>,
  apiKey: string,
  model: string,
  signal: AbortSignal,
) {
  const abort = new AbortController();
  const result = streamText({
    model: createOpenAI({ apiKey }).responses(model),
    system: `${insightsInstructions}\nAggregate evidence (JSON):\n${JSON.stringify(data)}`,
    messages: input.mode === 'overview'
      ? [{ role: 'user', content: 'What looks unusual or worth investigating in this data?' }]
      : input.messages,
    maxOutputTokens: 700,
    maxRetries: 0,
    timeout: { totalMs: 30_000, firstChunkMs: 15_000 },
    abortSignal: AbortSignal.any([signal, abort.signal]),
    providerOptions: { openai: { store: false, reasoningEffort: 'none' } },
    onError: () => { /* Error details can contain prompts; return only the safe stream error below. */ },
  });
  const encoder = new TextEncoder();
  const iterator = result.fullStream[Symbol.asyncIterator]();
  let hasText = false;
  let finished = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      try {
        while (true) {
          const chunk = await iterator.next();
          if (chunk.done) {
            if (!finished || !hasText) throw new Error('Incomplete response');
            send({ done: true });
            controller.close();
            return;
          }
          const part = chunk.value;
          if (part.type === 'error' || part.type === 'abort') throw new Error('Generation failed');
          if (part.type === 'finish') {
            if (part.finishReason !== 'stop') throw new Error('Incomplete response');
            finished = true;
          }
          if (part.type === 'text-delta') {
            hasText ||= Boolean(part.text.trim());
            send({ text: part.text });
            return;
          }
        }
      } catch {
        abort.abort();
        send({ error: 'AI analysis could not finish. Your aggregate data is still available. Please retry.' });
        controller.close();
      }
    },
    async cancel() { abort.abort(); await iterator.return?.(); },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
