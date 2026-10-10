import { readEvents } from '../../../../shared/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let lastId = request.headers.get('last-event-id') || undefined;
  let stopped = false;
  let polling = false;
  let timer: NodeJS.Timeout | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stop = (close: boolean) => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    request.signal.removeEventListener('abort', abort);
    if (close) controller.close();
  };
  const abort = () => stop(true);
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (request.signal.aborted) { stop(true); return; }
      request.signal.addEventListener('abort', abort, { once: true });
      const poll = async () => {
        if (stopped || polling) return;
        polling = true;
        try {
          const events = await readEvents(lastId);
          if (stopped) return;
          for (const event of events) {
            controller.enqueue(encoder.encode(`id: ${event.id.replace(/[\r\n]/g, '')}\ndata: ${JSON.stringify(event)}\n\n`));
            lastId = event.id;
          }
        } catch {
          if (!stopped) {
            controller.enqueue(encoder.encode('event: error\ndata: {"error":"Could not read watch events"}\n\n'));
            stop(true);
          }
        } finally {
          polling = false;
        }
      };
      timer = setInterval(() => { void poll(); }, 500);
      void poll();
    },
    cancel() { stop(false); },
  });
  return new Response(body, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
  } });
}
