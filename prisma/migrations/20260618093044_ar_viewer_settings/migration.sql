-- CreateTable
CREATE TABLE "ArViewerSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'all',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ArViewerProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ArViewerProduct_shop_idx" ON "ArViewerProduct"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ArViewerProduct_shop_productId_key" ON "ArViewerProduct"("shop", "productId");
