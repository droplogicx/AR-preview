import {
  getArViewerImageSetting,
  isArViewerEnabledForProduct,
  resolveArImageByAlt,
} from "../ar-viewer-settings.server";
import { authenticate, unauthenticated } from "../shopify.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function settingsPayload(partial: Record<string, unknown> = {}) {
  return {
    enabled: true,
    imageMode: "default",
    imageAlt: "",
    width: 60,
    height: 40,
    imageUrl: null,
    imageThumb: null,
    ...partial,
  };
}

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    if (!productId) {
      return Response.json(
        { error: "product_id is required" },
        { status: 400, headers: CORS },
      );
    }

    // Shopify app proxy always appends ?shop=…; prefer that, then auth session.
    let shop = url.searchParams.get("shop") || "";
    let admin = null;

    try {
      const auth = await authenticate.public.appProxy(request);
      if (auth.session?.shop) shop = auth.session.shop;
    } catch {
      // Proxy route may already have verified the request. Fall through with
      // shop from the query string when present.
      if (!shop) {
        const host = url.hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
        }
      }
    }

    if (!shop) {
      return Response.json({ error: "shop is required" }, { status: 400, headers: CORS });
    }

    try {
      const unauth = await unauthenticated.admin(shop);
      admin = unauth.admin;
    } catch {
      admin = null;
    }

    let enabled = true;
    try {
      enabled = await isArViewerEnabledForProduct(shop, productId, admin);
    } catch {
      // Fail open for product gating so storefront previews still load.
      enabled = true;
    }

    let imageSetting = { imageMode: "default", imageAlt: "" };
    try {
      imageSetting = enabled
        ? await getArViewerImageSetting(shop)
        : { imageMode: "default", imageAlt: "" };
    } catch {
      imageSetting = { imageMode: "default", imageAlt: "" };
    }

    let arImage = null;
    if (imageSetting.imageMode === "specific" && imageSetting.imageAlt && admin) {
      try {
        arImage = await resolveArImageByAlt(admin, productId, imageSetting.imageAlt);
      } catch {
        arImage = null;
      }
    }

    return Response.json(
      settingsPayload({
        enabled,
        imageMode: imageSetting.imageMode,
        imageAlt: imageSetting.imageAlt,
        imageUrl: arImage?.url || null,
        imageThumb: arImage?.thumb || null,
      }),
      { headers: CORS },
    );
  } catch {
    // Never 500 the storefront proxy — both AR Viewer and Poster Studio
    // treat a successful JSON body as the source of truth for eligibility.
    return Response.json(settingsPayload(), { headers: CORS });
  }
}
