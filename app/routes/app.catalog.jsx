import { fetchShopProductsPage } from "../ar-viewer-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  const catalog = await fetchShopProductsPage(admin, { cursor, first: 25 });
  return { catalog };
};
