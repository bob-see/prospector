import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const beforeCount = await prisma.contactProperty.count();

  console.log(`ContactProperty rows before reset: ${beforeCount}`);

  const result = await prisma.contactProperty.deleteMany();

  console.log(`Deleted ContactProperty rows: ${result.count}`);

  const afterCount = await prisma.contactProperty.count();

  console.log(`ContactProperty rows after reset: ${afterCount}`);
  console.log("Contact and MarketListing tables were not modified.");
}

main()
  .catch((error) => {
    console.error("Failed to reset ContactProperty rows.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
