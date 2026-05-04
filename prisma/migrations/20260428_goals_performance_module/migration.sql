-- CreateTable
CREATE TABLE "public"."MonthlyGoal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "revenueTarget" DECIMAL(12,2) NOT NULL,
    "appointmentsTarget" INTEGER NOT NULL,
    "averageTicketTarget" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyGoal_businessId_year_month_key" ON "public"."MonthlyGoal"("businessId", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyGoal_businessId_year_month_idx" ON "public"."MonthlyGoal"("businessId", "year", "month");

-- AddForeignKey
ALTER TABLE "public"."MonthlyGoal" ADD CONSTRAINT "MonthlyGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
