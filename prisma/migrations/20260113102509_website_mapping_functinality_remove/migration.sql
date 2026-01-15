/*
  Warnings:

  - You are about to drop the `Website` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WebsitePixel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Website" DROP CONSTRAINT "Website_userId_fkey";

-- DropForeignKey
ALTER TABLE "WebsitePixel" DROP CONSTRAINT "WebsitePixel_appId_fkey";

-- DropForeignKey
ALTER TABLE "WebsitePixel" DROP CONSTRAINT "WebsitePixel_websiteId_fkey";

-- DropTable
DROP TABLE "Website";

-- DropTable
DROP TABLE "WebsitePixel";
