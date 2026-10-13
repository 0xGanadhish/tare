import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES } from '@/components/docs/articles';
import { DocsShell } from '@/components/docs/DocsShell';
import { DOC_TOPICS, topicBySlug } from '@/components/docs/topics';

type Props = { params: Promise<{ topic: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_TOPICS.map((t) => ({ topic: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = topicBySlug((await params).topic);
  return t ? { title: `${t.title} · Tare docs`, description: t.blurb } : {};
}

export default async function DocsTopicPage({ params }: Props) {
  const topic = topicBySlug((await params).topic);
  if (!topic) notFound();
  const Article = ARTICLES[topic.slug];
  return (
    <DocsShell topic={topic}>
      <Article />
    </DocsShell>
  );
}
