import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow, Stamp, paper } from '@/components/docs/blocks';
import { CHECK_EVERY } from '@/components/docs/articles';
import { DOC_TOPICS, topicBySlug, type DocTopic } from '@/components/docs/topics';

export const metadata: Metadata = {
  title: 'Docs · Tare',
  description: 'How Tare works, in plain words: Explore, Pulse, the idle scan, the Advisor, Watch, Guardian v2 and the Verdict Ledger.',
};

const FEATURED = ['what-is-tare', 'guardian', 'ledger'];
const href = (t: DocTopic) => `/app/docs/${t.slug}`;
const num = (t: DocTopic) => String(DOC_TOPICS.indexOf(t) + 1).padStart(2, '0');

export default function DocsHubPage() {
  const intro = topicBySlug('what-is-tare')!;
  const guardian = topicBySlug('guardian')!;
  const ledger = topicBySlug('ledger')!;
  const rest = DOC_TOPICS.filter((t) => !FEATURED.includes(t.slug));

  return (
    <div>
      <header className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
        <div>
          <Eyebrow>Docs · {DOC_TOPICS.length} short topics</Eyebrow>
          <h1 className="display mt-3 max-w-[640px] text-[38px] sm:text-[56px]">How Tare works, in plain words</h1>
          <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-secondary sm:text-[17px]">
            Tare reads every yield on Monad, asks an AI judge which ones are real, and can pull you out when a vault turns risky. Each topic takes about a minute.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={href(intro)} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white transition hover:opacity-85">
              Start with What is Tare <span aria-hidden>→</span>
            </Link>
            <Link href={href(guardian)} className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-5 py-2.5 text-[13px] font-medium text-ink transition hover:border-ink/40">
              Jump to Guardian v2
            </Link>
          </div>
        </div>
        <OneBreath />
      </header>

      <section aria-label="Start here" className="mt-14 grid gap-4 md:grid-cols-3">
        <Link href={href(intro)} className="group relative flex flex-col overflow-hidden rounded-[16px] bg-ink p-6 text-white transition hover:-translate-y-0.5">
          <div className="mono flex justify-between text-[10.5px] uppercase tracking-[0.08em] text-faint">
            <span>Start here</span>
            <span>{num(intro)}</span>
          </div>
          <h2 className="mt-8 text-[24px] font-semibold tracking-[-0.02em]">{intro.title}</h2>
          <p className="mt-2 text-[13.5px] leading-snug text-consider">{intro.blurb}</p>
          <div aria-hidden className="mt-6 flex items-center gap-1.5">
            {['Read', 'Judge', 'Deposit', 'Watch', 'Post', 'Exit'].map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${i === 5 ? 'bg-deposit' : 'bg-white/40'}`} />
                {i < 5 && <span className="h-px w-3 bg-white/25 sm:w-4" />}
              </span>
            ))}
          </div>
          <span aria-hidden className="mono absolute bottom-5 right-6 text-[13px] text-faint transition group-hover:text-white">↗</span>
        </Link>

        <FeatureCard topic={guardian}>
          <div className="mono flex items-center gap-2 text-[12px] text-ink">
            <span className="rounded-full border border-hairline bg-white px-2 py-0.5">≥ 90% sure</span>
            <span className="rounded-full border border-hairline bg-white px-2 py-0.5">≤ 10 min old</span>
            <span className="text-muted">→</span>
            <span className="text-deposit">you</span>
          </div>
        </FeatureCard>

        <FeatureCard topic={ledger}>
          <div className="mono flex items-center gap-2 text-[12px]">
            <Stamp label="EXIT" />
            <span className="text-ink">94%</span>
            <span className="text-muted">→ graded by anyone</span>
          </div>
        </FeatureCard>
      </section>

      <section aria-labelledby="all-topics" className="mt-14">
        <h2 id="all-topics" className="mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
          Every feature
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rest.map((t) => (
            <Link key={t.slug} href={href(t)} className={`${paper} group flex flex-col p-5 transition hover:-translate-y-0.5`}>
              <div className="mono flex justify-between text-[10px] uppercase tracking-[0.08em] text-muted">
                <span>{t.group}</span>
                <span>{num(t)}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-ink">{t.title}</h3>
              <p className="mt-1.5 text-[13px] leading-snug text-secondary">{t.blurb}</p>
              <span className="mono mt-auto pt-4 text-[11px] text-faint transition-colors group-hover:text-ink">Read →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ topic, children }: { topic: DocTopic; children: React.ReactNode }) {
  return (
    <Link href={href(topic)} className={`${paper} group relative flex flex-col p-6 ring-1 ring-deposit/25 transition hover:-translate-y-0.5 hover:ring-deposit/60`}>
      <div className="mono flex items-center justify-between text-[10.5px] uppercase tracking-[0.08em] text-muted">
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-deposit px-2 py-[1px] text-[9.5px] text-white">New</span>
          {topic.group}
        </span>
        <span>{num(topic)}</span>
      </div>
      <h2 className="mt-8 text-[24px] font-semibold tracking-[-0.02em] text-ink">{topic.title}</h2>
      <p className="mt-2 text-[13.5px] leading-snug text-secondary">{topic.blurb}</p>
      <div className="mt-6">{children}</div>
      <span aria-hidden className="mono absolute bottom-5 right-6 text-[13px] text-faint transition group-hover:text-ink">↗</span>
    </Link>
  );
}

/** The hero slip: the whole protocol as a printed verdict slip, in the app's own visual language. */
function OneBreath() {
  const rows: [string, string][] = [
    ['Reads', 'every Monad pool ≥ $100k'],
    ['Judges', 'with Jev, odds shown'],
    ['Deposits', 'from your own wallet'],
    ['Watches', `every ${CHECK_EVERY.testnet} on testnet`],
    ['Exits', 'on your rule, only to you'],
  ];
  return (
    <aside aria-label="Tare in one breath" className={`${paper} relative mx-auto w-full max-w-[360px] px-5 pb-4 pt-[18px] lg:-rotate-[2deg]`}>
      <div className="mono flex justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted">
        <span>Slip · Docs</span>
        <span />
      </div>
      <div className="mt-1 max-w-[60%] text-[19px] font-semibold leading-tight tracking-[-0.02em]">Tare in one breath</div>
      <div aria-hidden className="mono absolute right-[18px] top-[34px] -rotate-[9deg] rounded-md border-[2.5px] border-deposit px-2.5 py-[5px] text-[12px] font-semibold tracking-[0.14em] text-deposit opacity-90">
        PLAIN
      </div>
      <dl className="mt-4 border-t-[1.5px] border-dashed border-[#e2dfea] pt-3 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mono mt-3 border-t-[1.5px] border-dashed border-[#e2dfea] pt-3 text-[10.5px] uppercase tracking-[0.06em] text-muted">
        Jev never holds keys · every call public
      </p>
    </aside>
  );
}
