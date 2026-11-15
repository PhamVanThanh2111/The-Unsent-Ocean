import { PrismaClient } from "@prisma/client";
import { INITIAL_OCEAN_MESSAGES } from "../src/lib/seed-data";

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    console.log(
      "Production mode: Automatic seeding of mock messages is disabled. (Set ALLOW_DEV_SEED=true to seed dev data)."
    );
    return;
  }

  const existingCount = await prisma.message.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} messages. Skipping seed.`);
    return;
  }

  console.log("Seeding The Unsent Ocean database...");
  const now = Date.now();

  for (const item of INITIAL_OCEAN_MESSAGES) {
    const createdAt = new Date(now - item.hoursAgo * 60 * 60 * 1000);
    await prisma.message.create({
      data: {
        content: item.content,
        recipientRole: item.recipientRole,
        tagColor: item.tagColor,
        candleCount: item.candleCount,
        viewsCount: item.viewsCount,
        posX: item.posX,
        posY: item.posY,
        createdAt,
      },
    });
  }

  console.log(`Seeded ${INITIAL_OCEAN_MESSAGES.length} unsent messages into the ocean.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

