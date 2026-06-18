-- CreateTable
CREATE TABLE "ArViewerProductImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageMode" TEXT NOT NULL DEFAULT 'default',
    "arImageUrl" TEXT,
    "arImageThumb" TEXT
);

-- CreateIndex
CREATE INDEX "ArViewerProductImage_shop_idx" ON "ArViewerProductImage"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ArViewerProductImage_shop_productId_key" ON "ArViewerProductImage"("shop", "productId");
