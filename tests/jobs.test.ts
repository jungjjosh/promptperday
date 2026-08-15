import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceType, QuestionStatus } from "@prisma/client";
import { runNewsQuestionsJob } from "@/lib/jobs/newsQuestions";
import { runAiQuestionsJob } from "@/lib/jobs/aiQuestions";
import { prisma, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("runNewsQuestionsJob", () => {
  it("inserts pending_review/news_derived rows in current_events, filtered by allowlist and denylist", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        articles: [
          // allowlisted source, clean headline -> should insert
          {
            title: "City council approves new transit line after years of debate",
            source: { id: "reuters", name: "Reuters" },
          },
          // allowlisted source, but denylisted keyword -> should skip
          {
            title: "Governor slams opponents over budget proposal",
            source: { id: "associated-press", name: "Associated Press" },
          },
          // not on the source allowlist -> should skip
          {
            title: "Wild take: you won't believe what happened next",
            source: { id: "some-tabloid", name: "Some Tabloid" },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await runNewsQuestionsJob(mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(3);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);

    const category = await prisma.category.findUniqueOrThrow({
      where: { name: "current events" },
    });
    const inserted = await prisma.question.findMany({
      where: { categoryId: category.id, sourceType: SourceType.NEWS_DERIVED },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe(QuestionStatus.PENDING_REVIEW);
    expect(inserted[0].text).toContain("City council approves new transit line");
  });

  it("never calls the real fetch (mocked)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", articles: [] }),
    }) as unknown as typeof fetch;

    await runNewsQuestionsJob(mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("newsapi.org"),
      expect.any(Object),
    );
  });
});

describe("runAiQuestionsJob", () => {
  function mockClient(questions: string[]) {
    return {
      messages: {
        parse: vi.fn().mockResolvedValue({
          parsed_output: { questions },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("inserts pending_review/ai_generated rows in philosophy", async () => {
    const questions = Array.from({ length: 10 }, (_, i) => `Philosophy prompt ${i}`);
    const client = mockClient(questions);

    const result = await runAiQuestionsJob("philosophy", client);

    expect(client.messages.parse).toHaveBeenCalledTimes(1);
    expect(client.messages.parse.mock.calls[0][0].model).toBe("claude-opus-5");
    expect(result.inserted).toBe(10);

    const category = await prisma.category.findUniqueOrThrow({ where: { name: "philosophy" } });
    const inserted = await prisma.question.findMany({
      where: { categoryId: category.id, sourceType: SourceType.AI_GENERATED },
    });
    expect(inserted).toHaveLength(10);
    expect(inserted.every((q) => q.status === QuestionStatus.PENDING_REVIEW)).toBe(true);
  });

  it("inserts pending_review/ai_generated rows in personal life", async () => {
    const questions = Array.from({ length: 10 }, (_, i) => `Personal life prompt ${i}`);
    const client = mockClient(questions);

    const result = await runAiQuestionsJob("personal life", client);

    expect(result.inserted).toBe(10);
    const category = await prisma.category.findUniqueOrThrow({
      where: { name: "personal life" },
    });
    const inserted = await prisma.question.findMany({
      where: { categoryId: category.id, sourceType: SourceType.AI_GENERATED },
    });
    expect(inserted).toHaveLength(10);
  });

  it("never calls the real Anthropic API (mocked)", async () => {
    const client = mockClient(Array.from({ length: 10 }, (_, i) => `q${i}`));
    await runAiQuestionsJob("philosophy", client);
    // The only network-capable call in the job is client.messages.parse,
    // and it's a vi.fn() stub, not the real SDK method.
    expect(client.messages.parse).toHaveBeenCalled();
  });
});
