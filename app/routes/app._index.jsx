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

  const shopHandle = session.shop.replace(/\.myshopify\.com$/i, "");

  return { ...settings, catalog, shopHandle };
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
      error: "Choose an image for every product set to Specific image",
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

function normalizeSettings({ mode, products, imageSettings }) {
  const normalizedImages = Object.entries(imageSettings || {})
    .filter(([, setting]) => setting?.imageMode === "specific" && setting?.arImageUrl)
    .map(([productId, setting]) => ({
      productId: toProductGid(productId),
      imageMode: "specific",
      arImageUrl: setting.arImageUrl || "",
      arImageThumb: setting.arImageThumb || setting.arImageUrl || "",
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  return {
    mode,
    products: [...products]
      .map((p) => ({
        productId: toProductGid(p.productId),
        title: p.title || "",
        imageUrl: p.imageUrl || "",
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    imageSettings: normalizedImages,
  };
}

function normalizeImagePrefs(imageSettings, productIds = []) {
  const ids = new Set([
    ...productIds.map((id) => toProductGid(id)),
    ...Object.keys(imageSettings || {}).map((id) => toProductGid(id)),
  ]);

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((productId) => {
      const setting = imageSettings?.[productId] || defaultImageSetting();
      return {
        productId,
        imageMode: setting.imageMode === "specific" ? "specific" : "default",
        arImageUrl: setting.arImageUrl || "",
      };
    });
}

function settingsEqual(a, b, imageTabProductIds = []) {
  const visibilityA = normalizeSettings({
    mode: a.mode,
    products: a.products,
    imageSettings: {},
  });
  const visibilityB = normalizeSettings({
    mode: b.mode,
    products: b.products,
    imageSettings: {},
  });

  if (JSON.stringify(visibilityA) !== JSON.stringify(visibilityB)) {
    return false;
  }

  const prefsA = normalizeImagePrefs(a.imageSettings, imageTabProductIds);
  const prefsB = normalizeImagePrefs(b.imageSettings, imageTabProductIds);
  return JSON.stringify(prefsA) === JSON.stringify(prefsB);
}

function hasIncompleteSpecificImages(imageSettings) {
  return Object.values(imageSettings || {}).some(
    (setting) => setting?.imageMode === "specific" && !setting?.arImageUrl,
  );
}

function withImageMode(existing, imageMode) {
  return {
    imageMode,
    arImageUrl: existing?.arImageUrl || "",
    arImageThumb: existing?.arImageThumb || "",
  };
}

function defaultImageSetting() {
  return { imageMode: "default", arImageUrl: "", arImageThumb: "" };
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
  onChooseImage,
}) {
  const isSpecific = setting?.imageMode === "specific";
  const hasSelectedImage = Boolean(setting?.arImageUrl);

  let thumbnailUrl = "";
  if (!isSpecific) {
    thumbnailUrl = product.imageUrl || "";
  } else if (hasSelectedImage) {
    thumbnailUrl = setting.arImageThumb || setting.arImageUrl;
  }

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
            Default product image
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
          {isSpecific ? (
            <s-button type="button" onClick={() => onChooseImage(product.productId)}>
              {hasSelectedImage ? "Change image" : "Choose image"}
            </s-button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImagePickerModal({
  open,
  files,
  loading,
  loadingMore,
  hasMore,
  selectedUrl,
  shopHandle,
  onClose,
  onConfirm,
  onLoadMore,
}) {
  const [pendingUrl, setPendingUrl] = useState(selectedUrl || "");
  const adminFilesUrl = shopHandle
    ? `https://admin.shopify.com/store/${shopHandle}/content/files`
    : null;

  useEffect(() => {
    if (open) {
      setPendingUrl(selectedUrl || "");
    }
  }, [open, selectedUrl]);

  if (!open) return null;

  const isInitialLoading = loading && files.length === 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select file"
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Select file</div>
          <div className={styles.modalHeaderActions}>
            {adminFilesUrl ? (
              <s-button
                type="button"
                onClick={() =>
                  window.open(adminFilesUrl, "_blank", "noopener,noreferrer")
                }
              >
                Upload new
              </s-button>
            ) : null}
            <button type="button" className={styles.modalClose} onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {isInitialLoading ? (
            <div className={styles.modalLoading}>
              <s-spinner size="large" accessibilityLabel="Loading files" />
            </div>
          ) : files.length === 0 ? (
            <s-paragraph>No image files found in your store.</s-paragraph>
          ) : (
            <>
              <div className={styles.fileGrid}>
                {files.map((file) => {
                  const isSelected = pendingUrl === file.url;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      className={`${styles.fileTile} ${
                        isSelected ? styles.fileTileSelected : ""
                      }`}
                      onClick={() => setPendingUrl(file.url)}
                    >
                      <div className={styles.fileTilePreview}>
                        <input
                          type="checkbox"
                          className={styles.fileCheckbox}
                          checked={isSelected}
                          readOnly
                          aria-hidden="true"
                          tabIndex={-1}
                        />
                        <img src={file.url} alt={file.altText || file.name} />
                      </div>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileExtension}>{file.extension}</span>
                    </button>
                  );
                })}
              </div>
              {hasMore ? (
                <div className={styles.loadMoreWrap}>
                  <s-button
                    type="button"
                    onClick={onLoadMore}
                    loading={loadingMore}
                  >
                    Load more files
                  </s-button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={`${styles.modalFooterButton} ${styles.modalFooterCancel}`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.modalFooterButton} ${styles.modalFooterDone}`}
            onClick={() => onConfirm(pendingUrl)}
            disabled={!pendingUrl}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const catalogFetcher = useFetcher();
  const imageFetcher = useFetcher();
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
  const [modalProductId, setModalProductId] = useState(null);
  const [storeFiles, setStoreFiles] = useState([]);
  const [storeFilesPageInfo, setStoreFilesPageInfo] = useState(null);

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

  const isDirty = !settingsEqual(
    { mode, products, imageSettings },
    savedSettings,
    imageTabProductIds,
  );
  const canSave = isDirty && !incompleteSpecificImages && !isSaving;

  useEffect(() => {
    if (!imageFetcher.data?.images) return;
    setStoreFiles((current) =>
      imageFetcher.data.append
        ? [...current, ...imageFetcher.data.images]
        : imageFetcher.data.images,
    );
    setStoreFilesPageInfo(imageFetcher.data.pageInfo || null);
  }, [imageFetcher.data]);

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
        current[gid],
        imageMode === "specific" ? "specific" : "default",
      ),
    }));
  };

  const openImagePicker = (productId) => {
    const gid = toProductGid(productId);
    setModalProductId(gid);
    setStoreFiles([]);
    setStoreFilesPageInfo(null);
    imageFetcher.load("/app/store-files");
  };

  const loadMoreStoreFiles = () => {
    if (!storeFilesPageInfo?.endCursor) return;
    imageFetcher.load(
      `/app/store-files?cursor=${encodeURIComponent(storeFilesPageInfo.endCursor)}`,
    );
  };

  const selectModalImage = (url) => {
    if (!modalProductId || !url) return;
    setImageSettings((current) => ({
      ...current,
      [modalProductId]: {
        imageMode: "specific",
        arImageUrl: url,
        arImageThumb: url,
      },
    }));
    setModalProductId(null);
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
          heading={
            mode === "all" ? "All products" : "Selected products"
          }
        >
          <s-paragraph>
            Choose whether each product uses its default featured image in AR or
            a specific image from the product gallery.
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
                    setting={imageSettings[gid] || defaultImageSetting()}
                    disabled={isSaving}
                    onModeChange={setProductImageMode}
                    onChooseImage={openImagePicker}
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

      <ImagePickerModal
        open={Boolean(modalProductId)}
        files={storeFiles}
        loading={imageFetcher.state !== "idle"}
        loadingMore={imageFetcher.state !== "idle" && storeFiles.length > 0}
        hasMore={storeFilesPageInfo?.hasNextPage}
        selectedUrl={imageSettings[modalProductId]?.arImageUrl || ""}
        shopHandle={loaderData.shopHandle}
        onClose={() => setModalProductId(null)}
        onConfirm={selectModalImage}
        onLoadMore={loadMoreStoreFiles}
      />

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
