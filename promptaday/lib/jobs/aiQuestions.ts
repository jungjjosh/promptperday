import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { QuestionStatus, SourceType } from "@prisma/client";
import { createAnthropicClient } from "@/lib/anthropicClient";
import { buildGenerationPrompt } from "@/lib/aiQuestionPrompts";

export type AiQuestionCategory = "philosophy" | "personal life";

const GeneratedQuestionsSchema = z.object({
  questions: z.array(z.string()).length(10),
});

export interface RunAiQuestionsJobResult {
  category: AiQuestionCategory;
  generated: number;
  inserted: number;
}

// `client` is injectable so tests can pass a stub with a mocked
// `messages.parse` and never hit the real Anthropic API.
export async function runAiQuestionsJob(
  categoryName: AiQuestionCategory,
  client: Pick<Anthropic, "messages"> = createAnthropicClient(),
): Promise<RunAiQuestionsJobResult> {
  const category = await prisma.category.findUniqueOrThrow({
    where: { name: categoryName },
  });

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildGenerationPrompt(categoryName) }],
    output_config: { format: zodOutputFormat(GeneratedQuestionsSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Anthropic API did not return parseable structured output");
  }

  let inserted = 0;
  for (const text of parsed.questions) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const existing = await prisma.question.findFirst({
      where: { categoryId: category.id, text: trimmed },
    });
    if (existing) continue;

    await prisma.question.create({
      data: {
        categoryId: category.id,
        text: trimmed,
        sourceType: SourceType.AI_GENERATED,
        status: QuestionStatus.PENDING_REVIEW,
      },
    });
    inserted += 1;
  }

  return { category: categoryName, generated: parsed.questions.length, inserted };
}
