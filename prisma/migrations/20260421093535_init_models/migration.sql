-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "primaryPhone" TEXT,
    "primaryEmail" TEXT,
    "rawNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactProperty" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addressRaw" TEXT NOT NULL,
    "streetNumber" TEXT,
    "streetName" TEXT,
    "streetType" TEXT,
    "suburb" TEXT,
    "postcode" TEXT,
    "relationshipType" TEXT,
    "confidenceScore" DOUBLE PRECISION,

    CONSTRAINT "ContactProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "addressRaw" TEXT NOT NULL,
    "streetNumber" TEXT,
    "streetName" TEXT,
    "streetType" TEXT,
    "suburb" TEXT,
    "listDate" TIMESTAMP(3),
    "soldDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContactProperty" ADD CONSTRAINT "ContactProperty_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
