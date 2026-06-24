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

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  if (!productId) {
    return Response.json(
      { error: "product_id is required" },
      { status: 400, headers: CORS },
    );
  }

  let shop = url.searchParams.get("shop") || "";

  try {
    const auth = await authenticate.public.appProxy(request);
    if (auth.session?.shop) shop = auth.session.shop;
  } catch {
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

  const enabled = await isArViewerEnabledForProduct(shop, productId);
  const imageSetting = enabled
    ? await getArViewerImageSetting(shop)
    : { imageMode: "default", imageAlt: "" };
  let arImage = null;

  if (imageSetting.imageMode === "specific" && imageSetting.imageAlt) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      arImage = await resolveArImageByAlt(admin, productId, imageSetting.imageAlt);
    } catch {
      arImage = null;
    }
  }

  return Response.json(
    {
      enabled,
      imageMode: imageSetting.imageMode,
      imageAlt: imageSetting.imageAlt,
      width: 60,
      height: 40,
      imageUrl: arImage?.url || null,
      imageThumb: arImage?.thumb || null,
    },
    { headers: CORS },
  );
}
