import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getArViewerSettings,
  saveArViewerSettings,
} from "../ar-viewer-settings.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/ar-viewer.module.css";

const SAVE_BAR_ID = "ar-viewer-save-bar";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return getArViewerSettings(session.shop);
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const mode = formData.get("mode");
  const imageMode = formData.get("imageMode");
  const imageAlt = formData.get("imageAlt") || "";
  let products = [];

  try {
    products = JSON.parse(formData.get("products") || "[]");
  } catch {
    return { ok: false, error: "Invalid settings payload" };
  }

  if (mode === "specific" && products.length === 0) {
    return { ok: false, error: "Select at least one product" };
  }

  if (imageMode === "specific" && !String(imageAlt).trim()) {
    return {
      ok: false,
      error: "Enter image alt text when using Alt text image",
    };
  }

  try {
    const settings = await saveArViewerSettings(session.shop, {
      mode,
      products,
      imageMode,
      imageAlt,
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

function normalizeImagePrefs(imageMode, imageAlt) {
  const isAlt = imageMode === "specific";
  return {
    imageMode: isAlt ? "specific" : "default",
    imageAlt: isAlt ? String(imageAlt || "").trim() : "",
  };
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

export default function Index() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [activeTab, setActiveTab] = useState("visibility");
  const [savedSettings, setSavedSettings] = useState({
    mode: loaderData.mode,
    products: loaderData.products,
    imageMode: loaderData.imageMode || "default",
    imageAlt: loaderData.imageAlt || "",
  });

  const [mode, setMode] = useState(loaderData.mode);
  const [products, setProducts] = useState(loaderData.products);
  const [imageMode, setImageMode] = useState(loaderData.imageMode || "default");
  const [imageAlt, setImageAlt] = useState(loaderData.imageAlt || "");

  const isSaving =
    fetcher.state === "submitting" || fetcher.state === "loading";
  const incompleteAltText =
    imageMode === "specific" && !String(imageAlt || "").trim();

  const isImageSettingsDirty = useMemo(() => {
    const current = normalizeImagePrefs(imageMode, imageAlt);
    const saved = normalizeImagePrefs(
      savedSettings.imageMode,
      savedSettings.imageAlt,
    );
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [imageMode, imageAlt, savedSettings.imageMode, savedSettings.imageAlt]);

  const isVisibilityDirty = useMemo(() => {
    const current = normalizeVisibility({ mode, products });
    const saved = normalizeVisibility({
      mode: savedSettings.mode,
      products: savedSettings.products,
    });
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [mode, products, savedSettings.mode, savedSettings.products]);

  const isDirty = isVisibilityDirty || isImageSettingsDirty;
  const canSave = isDirty && !incompleteAltText && !isSaving;

  useEffect(() => {
    if (fetcher.data?.ok) {
      const next = {
        mode: fetcher.data.mode,
        products: fetcher.data.products,
        imageMode: fetcher.data.imageMode || "default",
        imageAlt: fetcher.data.imageAlt || "",
      };
      setSavedSettings(next);
      setMode(fetcher.data.mode);
      setProducts(fetcher.data.products);
      setImageMode(fetcher.data.imageMode || "default");
      setImageAlt(fetcher.data.imageAlt || "");
      shopify.toast.show("AR Viewer settings saved");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        mode,
        products: JSON.stringify(products),
        imageMode,
        imageAlt,
      },
      { method: "post" },
    );
  }, [fetcher, mode, products, imageMode, imageAlt]);

  const handleDiscard = useCallback(() => {
    setMode(savedSettings.mode);
    setProducts(savedSettings.products);
    setImageMode(savedSettings.imageMode || "default");
    setImageAlt(savedSettings.imageAlt || "");
  }, [savedSettings]);

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
  };

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
        <s-section heading="Which product image should AR use?">
          <s-paragraph>
            Choose the image shown in the VR viewer on product pages. When using
            alt text image, the viewer matches a gallery image by its alt text.
            If no match is found, the featured image is used instead.
          </s-paragraph>

          <div className={styles.choiceGroup}>
            <label
              className={`${styles.choice} ${imageMode !== "specific" ? styles.choiceSelected : ""}`}
            >
              <input
                type="radio"
                name="ar-image-mode"
                value="default"
                className={styles.choiceInput}
                checked={imageMode !== "specific"}
                onChange={() => setImageMode("default")}
                disabled={isSaving}
              />
              <span className={styles.choiceLabel}>Featured image</span>
            </label>

            <label
              className={`${styles.choice} ${imageMode === "specific" ? styles.choiceSelected : ""}`}
            >
              <input
                type="radio"
                name="ar-image-mode"
                value="specific"
                className={styles.choiceInput}
                checked={imageMode === "specific"}
                onChange={() => setImageMode("specific")}
                disabled={isSaving}
              />
              <span className={styles.choiceLabel}>Alt text image</span>
            </label>
          </div>

          {imageMode === "specific" ? (
            <div style={{ marginTop: "16px", maxWidth: "480px" }}>
              <s-text-field
                label="Image alt text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.currentTarget.value)}
                placeholder="e.g. Room scene"
                details="Enter the exact alt text of the product image you want in AR."
                autocomplete="off"
                disabled={isSaving}
              />
            </div>
          ) : null}
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
