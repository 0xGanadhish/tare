import Link from 'next/link';
import type { ReactNode } from 'react';
import { DOC_GROUPS, DOC_TOPICS, neighbours, type DocTopic } from './topics';
import { Eyebrow, paper } from './blocks';

const href = (t: DocTopic) => `/app/docs/${t.slug}`;

/** A docs topic page: sidebar on wide screens, a scrolling topic strip on phones, prev/next at the bottom. */
export function DocsShell({ topic, children }: { topic: DocTopic; children: ReactNode }) {
  const { prev, next } = neighbours(topic.slug);
  return (
    <div className="lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block">
        <nav aria-label="Docs" className="sticky top-24">
          <Link href="/app/docs" className="mono text-[10.5px] uppercase tracking-[0.08em] text-muted transition-colors hover:text-ink">
            ← All docs
          </Link>
          {DOC_GROUPS.map((g) => (
            <div key={g} className="mt-6">
              <Eyebrow>{g}</Eyebrow>
              <ul className="mt-2 space-y-0.5 border-l border-hairline">
                {DOC_TOPICS.filter((t) => t.group === g).map((t) => {
                  const active = t.slug === topic.slug;
                  return (
                    <li key={t.slug}>
                      <Link
                        href={href(t)}
                        aria-current={active ? 'page' : undefined}
                        className={`-ml-px flex items-center gap-2 border-l py-1 pl-3 text-[13px] transition-colors ${
                          active ? 'border-deposit font-medium text-ink' : 'border-transparent text-secondary hover:border-ink/30 hover:text-ink'
                        }`}
                      >
                        {t.title}
                        {t.isNew && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-deposit" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <nav aria-label="Docs topics" className="-mx-4 mb-8 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
          <Link href="/app/docs" className="shrink-0 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px] text-secondary">
            All docs
          </Link>
          {DOC_TOPICS.map((t) => (
            <Link
              key={t.slug}
              href={href(t)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition ${
                t.slug === topic.slug ? 'border-ink bg-ink text-white' : 'border-hairline bg-white text-secondary'
              }`}
            >
              {t.title}
            </Link>
          ))}
        </nav>

        <article className="max-w-[740px]">
          <header>
            <Eyebrow className="flex items-center gap-2">
              <span>Docs · {topic.group}</span>
              {topic.isNew && <span className="rounded-full bg-deposit px-2 py-[1px] text-[9.5px] tracking-[0.08em] text-white">New</span>}
            </Eyebrow>
            <h1 className="display mt-3 text-[34px] sm:text-[46px]">{topic.title}</h1>
            <p className="mt-3 max-w-[620px] text-[16px] leading-relaxed text-secondary sm:text-[17px]">{topic.blurb}</p>
          </header>

          {children}

          {topic.app && (
            <div className="mt-12">
              <Link
                href={topic.app.href}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white transition hover:opacity-85"
              >
                {topic.app.label} <span aria-hidden>→</span>
              </Link>
            </div>
          )}

          <nav aria-label="Previous and next" className="mt-14 grid gap-3 border-t border-hairline pt-8 sm:grid-cols-2">
            {prev ? <PageLink t={prev} dir="Previous" /> : <span className="hidden sm:block" />}
            {next && <PageLink t={next} dir="Next" />}
          </nav>
        </article>
      </div>
    </div>
  );
}

function PageLink({ t, dir }: { t: DocTopic; dir: 'Previous' | 'Next' }) {
  return (
    <Link
      href={href(t)}
      aria-label={`${dir}: ${t.title}`}
      className={`${paper} group block p-4 transition hover:-translate-y-0.5 ${dir === 'Next' ? 'sm:col-start-2 sm:text-right' : ''}`}
    >
      <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
        {dir === 'Previous' ? '← Previous' : 'Next →'}
      </span>
      <span className="mt-1 block text-[15px] font-medium text-ink">{t.title}</span>
    </Link>
  );
}
