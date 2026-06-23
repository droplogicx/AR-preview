import prisma from "./db.server";

const SHOP_PRODUCTS_QUERY = `#graphql
  query ShopProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        featuredImage {
          url
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCTS_BY_IDS_QUERY = `#graphql
  query ProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
        }
      }
    }
  }
`;

const PRODUCT_IMAGES_QUERY = `#graphql
  query ProductImages($id: ID!) {
    product(id: $id) {
      images(first: 50) {
        nodes {
          altText
          url
          width
          height
        }
      }
      media(first: 50) {
        nodes {
          alt
          ... on MediaImage {
            image {
              url
              width
              height
            }
          }
        }
      }
    }
  }
`;

export function normalizeProductId(id) {
  if (!id) return "";
  const match = String(id).match(/(\d+)$/);
  return match ? match[1] : String(id);
}

export function toProductGid(productId) {
  const normalized = normalizeProductId(productId);
  if (!normalized) return "";
  if (String(productId).startsWith("gid://")) return String(productId);
  return `gid://shopify/Product/${normalized}`;
}

function thumbFromUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", "160");
    parsed.searchParams.set("height", "120");
    parsed.searchParams.set("crop", "center");
    return parsed.toString();
  } catch {
    return url;
  }
}

function mapImageSettings(rows) {
  const imageSettings = {};
  for (const row of rows) {
    imageSettings[row.productId] = {
      imageMode: row.imageMode || "default",
      imageAlt: row.imageAlt || "",
    };
  }
  return imageSettings;
}

export async function getArViewerImageSettings(shop) {
  const rows = await prisma.arViewerProductImage.findMany({ where: { shop } });
  return mapImageSettings(rows);
}

export async function getArViewerProductImageSetting(shop, productId) {
  const gid = toProductGid(productId);
  let row = await prisma.arViewerProductImage.findUnique({
    where: { shop_productId: { shop, productId: gid } },
  });

  if (!row) {
    const normalizedId = normalizeProductId(productId);
    const rows = await prisma.arViewerProductImage.findMany({ where: { shop } });
    row = rows.find(
      (entry) => normalizeProductId(entry.productId) === normalizedId,
    );
  }

  if (!row || row.imageMode !== "specific" || !row.imageAlt?.trim()) {
    return { imageMode: "default", imageAlt: null };
  }

  return {
    imageMode: "specific",
    imageAlt: row.imageAlt.trim(),
  };
}

export async function getArViewerProductImageAlt(shop, productId) {
  const setting = await getArViewerProductImageSetting(shop, productId);
  return setting.imageAlt;
}

export async function getArViewerSettings(shop) {
  const settings = await prisma.arViewerSettings.findUnique({ where: { shop } });
  const products = await prisma.arViewerProduct.findMany({
    where: { shop },
    orderBy: { productTitle: "asc" },
  });
  const imageSettings = await getArViewerImageSettings(shop);

  return {
    mode: settings?.mode ?? "all",
    products: products.map((p) => ({
      productId: p.productId,
      title: p.productTitle || p.productId,
      imageUrl: p.productImageUrl || "",
    })),
    imageSettings,
  };
}

export async function isArViewerEnabledForProduct(shop, productId) {
  const settings = await prisma.arViewerSettings.findUnique({ where: { shop } });
  const mode = settings?.mode ?? "all";
  if (mode !== "specific") return true;

  const normalizedId = normalizeProductId(productId);
  const products = await prisma.arViewerProduct.findMany({
    where: { shop },
    select: { productId: true },
  });

  return products.some(
    (p) => normalizeProductId(p.productId) === normalizedId,
  );
}

export async function resolveArImageByAlt(admin, productId, imageAlt) {
  const alt = String(imageAlt || "").trim();
  if (!alt || !admin) return null;

  const response = await admin.graphql(PRODUCT_IMAGES_QUERY, {
    variables: { id: toProductGid(productId) },
  });
  const json = await response.json();
  const product = json.data?.product;
  const candidates = [];

  for (const image of product?.images?.nodes || []) {
    if (!image?.url) continue;
    candidates.push({
      altText: image.altText || "",
      url: image.url,
      width: image.width || 0,
      height: image.height || 0,
    });
  }

  for (const node of product?.media?.nodes || []) {
    if (!node?.image?.url) continue;
    candidates.push({
      altText: node.alt || "",
      url: node.image.url,
      width: node.image.width || 0,
      height: node.image.height || 0,
    });
  }

  const normalizedAlt = alt.toLowerCase();
  const match = candidates.find(
    (image) => String(image.altText || "").trim().toLowerCase() === normalizedAlt,
  );

  if (!match?.url) return null;

  return {
    url: match.url,
    thumb: thumbFromUrl(match.url),
  };
}

export async function fetchShopProductsPage(admin, { cursor = null, first = 25 } = {}) {
  const response = await admin.graphql(SHOP_PRODUCTS_QUERY, {
    variables: { first, after: cursor },
  });
  const json = await response.json();
  const data = json.data?.products;

  if (!data) {
    throw new Error("Could not load products");
  }

  return {
    products: data.nodes.map((node) => ({
      productId: node.id,
      title: node.title,
      imageUrl: node.featuredImage?.url || "",
    })),
    pageInfo: data.pageInfo,
  };
}

export async function fetchProductsByIds(admin, productIds) {
  const ids = productIds.map(toProductGid).filter(Boolean);
  if (!ids.length) return [];

  const response = await admin.graphql(PRODUCTS_BY_IDS_QUERY, {
    variables: { ids },
  });
  const json = await response.json();
  const nodes = json.data?.nodes || [];

  return nodes
    .filter((node) => node?.id)
    .map((node) => ({
      productId: node.id,
      title: node.title,
      imageUrl: node.featuredImage?.url || "",
    }));
}

export async function saveArViewerSettings(shop, { mode, products, imageSettings }) {
  const normalizedMode = mode === "specific" ? "specific" : "all";
  const normalizedProducts =
    normalizedMode === "specific"
      ? products.filter((p) => p.productId)
      : [];

  const normalizedImageSettings = Object.entries(imageSettings || {})
    .map(([productId, setting]) => ({
      shop,
      productId: toProductGid(productId),
      imageMode: setting?.imageMode === "specific" ? "specific" : "default",
      imageAlt:
        setting?.imageMode === "specific"
          ? String(setting?.imageAlt || "").trim() || null
          : null,
    }))
    .filter((row) => row.imageMode === "specific" && row.imageAlt);

  await prisma.$transaction([
    prisma.arViewerSettings.upsert({
      where: { shop },
      create: { shop, mode: normalizedMode },
      update: { mode: normalizedMode },
    }),
    prisma.arViewerProduct.deleteMany({ where: { shop } }),
    ...(normalizedProducts.length
      ? [
          prisma.arViewerProduct.createMany({
            data: normalizedProducts.map((p) => ({
              shop,
              productId: toProductGid(p.productId),
              productTitle: p.title || null,
              productImageUrl: p.imageUrl || null,
            })),
          }),
        ]
      : []),
    prisma.arViewerProductImage.deleteMany({ where: { shop } }),
    ...(normalizedImageSettings.length
      ? [
          prisma.arViewerProductImage.createMany({
            data: normalizedImageSettings,
          }),
        ]
      : []),
  ]);

  return getArViewerSettings(shop);
}
