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

const STORE_FILES_QUERY = `#graphql
  query StoreFiles($first: Int!, $after: String) {
    files(first: $first, after: $after, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) {
      nodes {
        ... on MediaImage {
          id
          alt
          image {
            url
            width
            height
          }
        }
        ... on GenericFile {
          id
          url
          mimeType
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const base = decodeURIComponent(pathname.split("/").pop() || "image");
    const dot = base.lastIndexOf(".");
    if (dot === -1) {
      return { name: base, extension: "JPG" };
    }
    return {
      name: base.slice(0, dot),
      extension: base.slice(dot + 1).toUpperCase(),
    };
  } catch {
    return { name: "image", extension: "JPG" };
  }
}

function addImageFile(files, seen, image) {
  if (!image?.url || seen.has(image.url)) return;
  seen.add(image.url);
  const { name, extension } = fileNameFromUrl(image.url);
  files.push({
    id: image.id || image.url,
    url: image.url,
    name,
    extension,
    altText: image.altText || image.alt || "",
    width: image.width || 0,
    height: image.height || 0,
  });
}

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

function mapImageSettings(rows) {
  const imageSettings = {};
  for (const row of rows) {
    imageSettings[row.productId] = {
      imageMode: row.imageMode || "default",
      arImageUrl: row.arImageUrl || "",
      arImageThumb: row.arImageThumb || "",
    };
  }
  return imageSettings;
}

export async function getArViewerImageSettings(shop) {
  const rows = await prisma.arViewerProductImage.findMany({ where: { shop } });
  return mapImageSettings(rows);
}

export async function getArViewerProductImage(shop, productId) {
  const gid = toProductGid(productId);
  const row = await prisma.arViewerProductImage.findUnique({
    where: { shop_productId: { shop, productId: gid } },
  });

  if (!row || row.imageMode !== "specific" || !row.arImageUrl) {
    return null;
  }

  return {
    url: row.arImageUrl,
    thumb: row.arImageThumb || row.arImageUrl,
  };
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

export async function fetchStoreImageFiles(admin, { cursor = null, first = 30 } = {}) {
  const response = await admin.graphql(STORE_FILES_QUERY, {
    variables: { first, after: cursor },
  });
  const json = await response.json();
  const data = json.data?.files;

  if (!data) {
    throw new Error("Could not load store files");
  }

  const files = [];
  const seen = new Set();

  for (const node of data.nodes || []) {
    if (node?.image?.url) {
      addImageFile(files, seen, {
        id: node.id,
        url: node.image.url,
        alt: node.alt,
        width: node.image.width,
        height: node.image.height,
      });
      continue;
    }

    if (node?.url && String(node.mimeType || "").startsWith("image/")) {
      addImageFile(files, seen, {
        id: node.id,
        url: node.url,
        altText: "",
      });
    }
  }

  return {
    images: files,
    pageInfo: data.pageInfo,
  };
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
      arImageUrl:
        setting?.imageMode === "specific" ? setting?.arImageUrl || null : null,
      arImageThumb:
        setting?.imageMode === "specific"
          ? setting?.arImageThumb || setting?.arImageUrl || null
          : null,
    }))
    .filter(
      (row) =>
        row.imageMode === "specific" && row.arImageUrl,
    );

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
