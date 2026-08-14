import { prisma } from "@/lib/prisma";
import { QuestionStatus, SourceType } from "@prisma/client";
import { ALLOWED_NEWS_SOURCE_IDS, HEADLINE_DENYLIST_KEYWORDS } from "@/lib/newsSources";
import { headlineToPrompt } from "@/lib/currentEventsTemplates";

export interface NewsApiArticle {
  title: string;
  source: { id: string | null; name: string };
}

interface NewsApiResponse {
  status: string;
  articles: NewsApiArticle[];
}

// NewsAPI.org's top-headlines shape — the "[news API]" referenced in the
// spec. Provider is swappable behind this function; everything downstream
// only depends on { title, source: { id } }.
export async function fetchHeadlines(
  fetchImpl: typeof fetch = fetch,
): Promise<NewsApiArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY is not set");

  const sourcesParam = ALLOWED_NEWS_SOURCE_IDS.join(",");
  const res = await fetchImpl(
    `https://newsapi.org/v2/top-headlines?sources=${sourcesParam}&pageSize=20`,
    { headers: { "X-Api-Key": apiKey } },
  );
  if (!res.ok) throw new Error(`News API request failed: ${res.status}`);

  const data = (await res.json()) as NewsApiResponse;
  return data.articles ?? [];
}

function passesSourceAllowlist(article: NewsApiArticle): boolean {
  return !!article.source.id && ALLOWED_NEWS_SOURCE_IDS.includes(article.source.id);
}

function passesKeywordDenylist(headline: string): boolean {
  const lower = headline.toLowerCase();
  return !HEADLINE_DENYLIST_KEYWORDS.some((word) => lower.includes(word));
}

export interface RunNewsQuestionsJobResult {
  fetched: number;
  inserted: number;
  skipped: number;
}

export async function runNewsQuestionsJob(
  fetchImpl: typeof fetch = fetch,
): Promise<RunNewsQuestionsJobResult> {
  const category = await prisma.category.findUniqueOrThrow({
    where: { name: "current events" },
  });

  const articles = await fetchHeadlines(fetchImpl);

  let inserted = 0;
  let skipped = 0;

  for (const article of articles) {
    if (!article.title || !passesSourceAllowlist(article) || !passesKeywordDenylist(article.title)) {
      skipped += 1;
      continue;
    }

    const text = headlineToPrompt(article.title);

    const existing = await prisma.question.findFirst({
      where: { categoryId: category.id, text },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.question.create({
      data: {
        categoryId: category.id,
        text,
        sourceType: SourceType.NEWS_DERIVED,
        status: QuestionStatus.PENDING_REVIEW,
      },
    });
    inserted += 1;
  }

  return { fetched: articles.length, inserted, skipped };
}
