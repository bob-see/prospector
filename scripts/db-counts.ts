import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [contactCount, contactPropertyCount, marketListingCount] =
    await Promise.all([
      prisma.contact.count(),
      prisma.contactProperty.count(),
      prisma.marketListing.count(),
    ]);

  console.log(`Contact count: ${contactCount}`);
  console.log(`ContactProperty count: ${contactPropertyCount}`);
  console.log(`MarketListing count: ${marketListingCount}`);
}

main()
  .catch((error) => {
    console.error("Failed to read database counts.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
