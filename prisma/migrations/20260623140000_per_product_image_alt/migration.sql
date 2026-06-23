-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ArViewerSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'all',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ArViewerSettings" ("mode", "shop", "updatedAt") SELECT "mode", "shop", "updatedAt" FROM "ArViewerSettings";
DROP TABLE "ArViewerSettings";
ALTER TABLE "new_ArViewerSettings" RENAME TO "ArViewerSettings";
CREATE TABLE "new_ArViewerProductImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageMode" TEXT NOT NULL DEFAULT 'default',
    "imageAlt" TEXT
);
INSERT INTO "new_ArViewerProductImage" ("id", "imageMode", "productId", "shop")
SELECT "id", "imageMode", "productId", "shop" FROM "ArViewerProductImage";
DROP TABLE "ArViewerProductImage";
ALTER TABLE "new_ArViewerProductImage" RENAME TO "ArViewerProductImage";
CREATE INDEX "ArViewerProductImage_shop_idx" ON "ArViewerProductImage"("shop");
CREATE UNIQUE INDEX "ArViewerProductImage_shop_productId_key" ON "ArViewerProductImage"("shop", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
