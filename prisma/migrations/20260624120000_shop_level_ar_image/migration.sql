-- Shop-level AR image setting (featured vs alt-text match)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ArViewerSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'all',
    "imageMode" TEXT NOT NULL DEFAULT 'default',
    "imageAlt" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ArViewerSettings" ("shop", "mode", "updatedAt", "imageMode", "imageAlt")
SELECT "shop", "mode", "updatedAt", 'default', NULL FROM "ArViewerSettings";
DROP TABLE "ArViewerSettings";
ALTER TABLE "new_ArViewerSettings" RENAME TO "ArViewerSettings";

DROP TABLE IF EXISTS "ArViewerProductImage";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
