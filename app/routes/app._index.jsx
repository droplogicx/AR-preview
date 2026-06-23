import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  fetchShopProductsPage,
  getArViewerSettings,
  saveArViewerSettings,
} from "../ar-viewer-settings.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/ar-viewer.module.css";

const SAVE_BAR_ID = "ar-viewer-save-bar";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const settings = await getArViewerSettings(session.shop);

  let catalog = {
    products: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  };

  if (settings.mode === "all") {
    catalog = await fetchShopProductsPage(admin, { cursor, first: 25 });
  }

  return { ...settings, catalog };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const mode = formData.get("mode");
  let products = [];
  let imageSettings = {};

  try {
    products = JSON.parse(formData.get("products") || "[]");
    imageSettings = JSON.parse(formData.get("imageSettings") || "{}");
  } catch {
    return { ok: false, error: "Invalid settings payload" };
  }

  if (mode === "specific" && products.length === 0) {
    return { ok: false, error: "Select at least one product" };
  }

  if (hasIncompleteSpecificImages(imageSettings)) {
    return {
      ok: false,
      error: "Enter image alt text for every product set to Specific image",
    };
  }

  try {
    const settings = await saveArViewerSettings(session.shop, {
      mode,
      products,
      imageSettings,
    });
    return { ok: true, ...settings };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Could not save settings",
    };
  }
};

function productImageFromPicker(product) {
  return (
    product.images?.[0]?.originalSrc ||
    product.images?.[0]?.url ||
    product.featuredImage?.url ||
    product.featuredMedia?.preview?.image?.url ||
    product.image?.url ||
    ""
  );
}

function toProductGid(productId) {
  if (!productId) return "";
  if (String(productId).startsWith("gid://")) return String(productId);
  const match = String(productId).match(/(\d+)$/);
  return match ? `gid://shopify/Product/${match[1]}` : String(productId);
}

function normalizeVisibility({ mode, products }) {
  return {
    mode,
    products: [...products]
      .map((p) => ({
        productId: toProductGid(p.productId),
        title: p.title || "",
        imageUrl: p.imageUrl || "",
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
}

function getImageSetting(imageSettings, productId) {
  const gid = toProductGid(productId);
  if (!imageSettings?.[gid]) {
    const entry = Object.entries(imageSettings || {}).find(
      ([key]) => toProductGid(key) === gid,
    );
    if (entry) return entry[1];
  }
  return imageSettings?.[gid] || defaultImageSetting();
}

function normalizeImagePrefs(imageSettings, productIds = []) {
  const ids = new Set([
    ...productIds.map((id) => toProductGid(id)),
    ...Object.keys(imageSettings || {}).map((id) => toProductGid(id)),
  ]);

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((productId) => {
      const setting = getImageSetting(imageSettings, productId);
      const isSpecific = setting.imageMode === "specific";
      return {
        productId,
        imageMode: isSpecific ? "specific" : "default",
        imageAlt: isSpecific ? String(setting.imageAlt || "").trim() : "",
      };
    });
}

function hasIncompleteSpecificImages(imageSettings) {
  return Object.values(imageSettings || {}).some(
    (setting) =>
      setting?.imageMode === "specific" && !String(setting?.imageAlt || "").trim(),
  );
}

function withImageMode(existing, imageMode) {
  if (imageMode === "specific") {
    return {
      imageMode: "specific",
      imageAlt: existing?.imageAlt || "",
    };
  }
  return { imageMode: "default", imageAlt: "" };
}

function defaultImageSetting() {
  return { imageMode: "default", imageAlt: "" };
}

function DeleteIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.5 3.5H13.5M4 5.5H16M14.8333 5.5L14.4 14.9C14.3667 15.5967 13.7867 16.15 13.0883 16.15H6.91167C6.21333 16.15 5.63333 15.5967 5.6 14.9L5.16667 5.5M8.16667 8.25V12.75M11.8333 8.25V12.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProductRow({ product, onRemove, disabled }) {
  return (
    <div className={styles.productRow}>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className={styles.productImage} />
      ) : (
        <div
          className={`${styles.productImage} ${styles.productImagePlaceholder}`}
        >
          —
        </div>
      )}
      <span className={styles.productTitle}>{product.title}</span>
      <button
        type="button"
        className={styles.deleteButton}
        aria-label={`Remove ${product.title}`}
        onClick={() => onRemove(product.productId)}
        disabled={disabled}
      >
        <DeleteIcon />
      </button>
    </div>
  );
}

function EmptyImagePlaceholder() {
  return (
    <div
      className={`${styles.productImage} ${styles.imageEmptyPlaceholder}`}
      aria-hidden="true"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="3"
          y="4"
          width="14"
          height="12"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M3 13L7.5 9.5L10.5 12L13.5 9L17 12.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="7" cy="8" r="1.25" fill="currentColor" />
      </svg>
    </div>
  );
}

function ImageProductRow({
  product,
  setting,
  disabled,
  onModeChange,
  onAltChange,
}) {
  const isSpecific = setting?.imageMode === "specific";
  const thumbnailUrl = product.imageUrl || "";

  return (
    <div className={styles.imageRow}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className={styles.productImage} />
      ) : (
        <EmptyImagePlaceholder />
      )}

      <div className={styles.imageRowMain}>
        <div className={styles.imageRowTitle}>{product.title}</div>
        <div className={styles.imageModeGroup}>
          <label className={styles.imageModeLabel}>
            <input
              type="radio"
              name={`image-mode-${product.productId}`}
              checked={!isSpecific}
              onChange={() => onModeChange(product.productId, "default")}
              disabled={disabled}
            />
            Featured Image
          </label>
          <label className={styles.imageModeLabel}>
            <input
              type="radio"
              name={`image-mode-${product.productId}`}
              checked={isSpecific}
              onChange={() => onModeChange(product.productId, "specific")}
              disabled={disabled}
            />
            Specific image
          </label>
        </div>
        {isSpecific ? (
          <div className={styles.imageAltField}>
            <label className={styles.imageAltLabel} htmlFor={`image-alt-${product.productId}`}>
              Image alt text
            </label>
            <input
              id={`image-alt-${product.productId}`}
              type="text"
              className={styles.imageAltInput}
              value={setting?.imageAlt || ""}
              onChange={(event) =>
                onAltChange(product.productId, event.target.value)
              }
              autoComplete="off"
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Index() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const catalogFetcher = useFetcher();
  const shopify = useAppBridge();

  const [activeTab, setActiveTab] = useState("visibility");
  const [savedSettings, setSavedSettings] = useState({
    mode: loaderData.mode,
    products: loaderData.products,
    imageSettings: loaderData.imageSettings || {},
  });

  const [mode, setMode] = useState(loaderData.mode);
  const [products, setProducts] = useState(loaderData.products);
  const [imageSettings, setImageSettings] = useState(
    loaderData.imageSettings || {},
  );
  const [catalogProducts, setCatalogProducts] = useState(
    loaderData.catalog?.products || [],
  );
  const [catalogPageInfo, setCatalogPageInfo] = useState(
    loaderData.catalog?.pageInfo || { hasNextPage: false, endCursor: null },
  );

  const isSaving =
    fetcher.state === "submitting" || fetcher.state === "loading";
  const incompleteSpecificImages = useMemo(
    () => hasIncompleteSpecificImages(imageSettings),
    [imageSettings],
  );

  const imageTabProducts = useMemo(() => {
    if (mode === "specific") return products;
    return catalogProducts;
  }, [mode, products, catalogProducts]);

  const imageTabProductIds = useMemo(
    () => imageTabProducts.map((product) => product.productId),
    [imageTabProducts],
  );

  const isImageSettingsDirty = useMemo(() => {
    const current = normalizeImagePrefs(imageSettings, imageTabProductIds);
    const saved = normalizeImagePrefs(
      savedSettings.imageSettings,
      imageTabProductIds,
    );
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [imageSettings, savedSettings.imageSettings, imageTabProductIds]);

  const isVisibilityDirty = useMemo(() => {
    const current = normalizeVisibility({ mode, products });
    const saved = normalizeVisibility({
      mode: savedSettings.mode,
      products: savedSettings.products,
    });
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [mode, products, savedSettings.mode, savedSettings.products]);

  const isDirty = isVisibilityDirty || isImageSettingsDirty;
  const canSave = isDirty && !incompleteSpecificImages && !isSaving;

  useEffect(() => {
    if (fetcher.data?.ok) {
      const next = {
        mode: fetcher.data.mode,
        products: fetcher.data.products,
        imageSettings: fetcher.data.imageSettings || {},
      };
      setSavedSettings(next);
      setMode(fetcher.data.mode);
      setProducts(fetcher.data.products);
      setImageSettings(fetcher.data.imageSettings || {});
      shopify.toast.show("AR Viewer settings saved");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (!catalogFetcher.data?.catalog) return;
    const { products: nextProducts, pageInfo } = catalogFetcher.data.catalog;
    setCatalogProducts((current) =>
      current.length ? [...current, ...nextProducts] : nextProducts,
    );
    setCatalogPageInfo(pageInfo);
  }, [catalogFetcher.data]);

  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        mode,
        products: JSON.stringify(products),
        imageSettings: JSON.stringify(imageSettings),
      },
      { method: "post" },
    );
  }, [fetcher, mode, products, imageSettings]);

  const handleDiscard = useCallback(() => {
    setMode(savedSettings.mode);
    setProducts(savedSettings.products);
    setImageSettings(savedSettings.imageSettings);
    setCatalogProducts(loaderData.catalog?.products || []);
    setCatalogPageInfo(
      loaderData.catalog?.pageInfo || { hasNextPage: false, endCursor: null },
    );
  }, [savedSettings, loaderData.catalog]);

  const pickProducts = useCallback(async () => {
    const picked = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      filter: {
        variants: false,
      },
      selectionIds: products.map((p) => ({ id: toProductGid(p.productId) })),
    });

    if (!picked?.length) return;

    setProducts(
      picked.map((p) => ({
        productId: p.id,
        title: p.title,
        imageUrl: productImageFromPicker(p),
      })),
    );
  }, [products, shopify]);

  const removeProduct = (productId) => {
    const gid = toProductGid(productId);
    setProducts((current) =>
      current.filter((p) => toProductGid(p.productId) !== gid),
    );
    setImageSettings((current) => {
      const next = { ...current };
      delete next[gid];
      return next;
    });
  };

  const setProductImageMode = (productId, imageMode) => {
    const gid = toProductGid(productId);
    setImageSettings((current) => ({
      ...current,
      [gid]: withImageMode(
        getImageSetting(current, productId),
        imageMode === "specific" ? "specific" : "default",
      ),
    }));
  };

  const setProductImageAlt = (productId, imageAlt) => {
    const gid = toProductGid(productId);
    setImageSettings((current) => ({
      ...current,
      [gid]: {
        imageMode: "specific",
        imageAlt,
      },
    }));
  };

  const loadMoreProducts = () => {
    if (!catalogPageInfo?.endCursor) return;
    catalogFetcher.load(
      `/app/catalog?cursor=${encodeURIComponent(catalogPageInfo.endCursor)}`,
    );
  };

  useEffect(() => {
    if (activeTab !== "images" || mode !== "all" || catalogProducts.length > 0) {
      return;
    }
    if (catalogFetcher.state !== "idle") return;
    catalogFetcher.load("/app/catalog");
  }, [activeTab, mode, catalogProducts.length, catalogFetcher]);

  return (
    <s-page heading="AR Viewer">
      <SaveBar id={SAVE_BAR_ID} open={isDirty}>
        <button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </button>
        <button type="button" onClick={handleDiscard} disabled={isSaving}>
          Discard
        </button>
      </SaveBar>

      <div className={styles.tabList}>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === "visibility" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActiveTab("visibility")}
        >
          Visibility
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === "images" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActiveTab("images")}
        >
          AR images
        </button>
      </div>

      {activeTab === "visibility" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <s-section heading="Where should the viewer appear?">
            <s-paragraph>
              Choose whether the AR Viewer block is available on every product
              page or only on products you select below.
            </s-paragraph>

            <div className={styles.choiceGroup}>
              <label
                className={`${styles.choice} ${mode === "all" ? styles.choiceSelected : ""}`}
              >
                <input
                  type="radio"
                  name="ar-mode-ui"
                  value="all"
                  className={styles.choiceInput}
                  checked={mode === "all"}
                  onChange={() => setMode("all")}
                />
                <span className={styles.choiceLabel}>All products</span>
              </label>

              <label
                className={`${styles.choice} ${mode === "specific" ? styles.choiceSelected : ""}`}
              >
                <input
                  type="radio"
                  name="ar-mode-ui"
                  value="specific"
                  className={styles.choiceInput}
                  checked={mode === "specific"}
                  onChange={() => setMode("specific")}
                />
                <span className={styles.choiceLabel}>Specific products only</span>
              </label>
            </div>
          </s-section>

          {mode === "specific" && (
            <s-section heading="Selected products">
              <div className={styles.productsToolbar}>
                <s-button type="button" onClick={pickProducts}>
                  Select products
                </s-button>
                {products.length > 0 && (
                  <span className={styles.productCount}>
                    {products.length} product{products.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {products.length === 0 ? (
                <div className={styles.emptyState}>
                  No products selected yet. Click &quot;Select products&quot; to
                  choose which products show the AR Viewer.
                </div>
              ) : (
                <div className={styles.productList}>
                  {products.map((product) => (
                    <ProductRow
                      key={product.productId}
                      product={product}
                      onRemove={removeProduct}
                      disabled={isSaving}
                    />
                  ))}
                </div>
              )}
            </s-section>
          )}
        </div>
      ) : (
        <s-section
          heading={mode === "all" ? "All products" : "Selected products"}
        >
          <s-paragraph>
            Choose whether each product uses its featured image in AR or a
            specific gallery image matched by alt text.
          </s-paragraph>

          {mode === "specific" && products.length === 0 ? (
            <div className={styles.emptyState}>
              Select products on the Visibility tab first, then configure AR
              images here.
            </div>
          ) : imageTabProducts.length === 0 ? (
            <div className={styles.emptyState}>No products found.</div>
          ) : (
            <div className={styles.productList}>
              {imageTabProducts.map((product) => {
                const gid = toProductGid(product.productId);
                return (
                  <ImageProductRow
                    key={gid}
                    product={product}
                    setting={getImageSetting(imageSettings, gid)}
                    disabled={isSaving}
                    onModeChange={setProductImageMode}
                    onAltChange={setProductImageAlt}
                  />
                );
              })}
              {mode === "all" && catalogPageInfo?.hasNextPage ? (
                <div className={styles.loadMoreWrap}>
                  <s-button
                    type="button"
                    onClick={loadMoreProducts}
                    disabled={catalogFetcher.state !== "idle"}
                  >
                    Load more products
                  </s-button>
                </div>
              ) : null}
            </div>
          )}
        </s-section>
      )}

      <s-section slot="aside" heading="Theme setup">
        <s-paragraph>
          Add the <strong>VR Viewer</strong> app block to your product template
          in the theme editor. The block will only render on products allowed by
          these settings.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
