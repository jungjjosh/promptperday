import { PrismaClient, SourceType, QuestionStatus } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "current events", enabledByDefault: true },
  { name: "philosophy", enabledByDefault: true },
  { name: "personal life", enabledByDefault: true },
] as const;

const QUESTIONS: Record<(typeof CATEGORIES)[number]["name"], string[]> = {
  "current events": [
    "A new technology just changed how millions of people do their jobs overnight. Write a letter to someone entering that field in ten years — what do you want them to know?",
    "Describe a recent headline that made you change your mind about something, however small. Walk through what shifted and why.",
    "Imagine explaining this week's biggest news story to someone from 50 years in the past. What would confuse them most, and what would you have to explain first?",
    "A city you've never visited just made a major policy change. Write the letter a longtime resident might send to a newcomer explaining what life there feels like now.",
    "Pick an ongoing global issue you rarely think about. Write the internal monologue of someone directly affected by it today.",
    "A public figure recently made a decision that surprised you. Argue the case for why it might have been the right call, even if you disagree.",
    "Something in the news this week will look completely different in retrospect ten years from now. Write from that future vantage point looking back.",
    "Describe how a recent event has quietly changed a small daily habit of yours, even if you hadn't noticed until now.",
    "Write an advice-column response to someone anxious about a current event beyond their control. What would you actually tell them?",
    "A recent event forced someone to make a hard tradeoff between two things they value. Reconstruct that decision from the inside.",
  ],
  philosophy: [
    "Describe a moment when you did the right thing for the wrong reason. Does the reason matter as much as the outcome?",
    "Write a letter to a stranger explaining why their life has meaning, without appealing to religion or achievement.",
    "If you could permanently forget one true thing about the world to be happier, would you? Walk through the reasoning.",
    "Argue the strongest possible case against something you believe deeply.",
    "Describe what you'd lose if you became someone who never felt regret.",
    "Reconstruct, scene by scene, a moment where you felt truly free. What made it different from ordinary freedom?",
    "Is a promise still binding if the person you made it to would release you from it, but you never asked? Reason it through.",
    "Write the eulogy you'd want, then explain which parts of that person you actually are today.",
    "Describe an ethical dilemma with no clean answer that you've actually faced, and defend the choice you made.",
    "If your values were a currency, what have you spent them on this year? Where did you get the best return?",
  ],
  "personal life": [
    "Write a letter you'll never send to someone who shaped you more than they know.",
    "Reconstruct, in sensory detail, a room from your childhood you haven't thought about in years.",
    "Describe a relationship that ended without a clear reason. Reason through what you think actually happened.",
    "Write the advice you'd give your exact self from five years ago, knowing they won't take all of it.",
    "Describe a small decision that quietly changed the direction of your life more than a big one did.",
    "Reconstruct a conversation you wish had gone differently, and rewrite your half of it.",
    "What is a value you inherited from your family that you're still deciding whether to keep?",
    "Describe the version of yourself you were afraid of becoming, and how close you've come.",
    "Write a letter to yourself ten years from now about what you hope stays the same.",
    "Reconstruct a moment of unexpected kindness from a stranger, in full sensory detail.",
  ],
};

async function main() {
  for (const category of CATEGORIES) {
    const savedCategory = await prisma.category.upsert({
      where: { name: category.name },
      update: { enabledByDefault: category.enabledByDefault },
      create: category,
    });

    for (const text of QUESTIONS[category.name]) {
      const existing = await prisma.question.findFirst({
        where: { categoryId: savedCategory.id, text },
      });
      if (existing) continue;

      await prisma.question.create({
        data: {
          categoryId: savedCategory.id,
          text,
          sourceType: SourceType.CURATED,
          status: QuestionStatus.APPROVED,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
