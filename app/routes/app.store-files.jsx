import { fetchStoreImageFiles } from "../ar-viewer-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  try {
    const data = await fetchStoreImageFiles(admin, { cursor, first: 30 });
    return {
      ...data,
      append: Boolean(cursor),
    };
  } catch (error) {
    return Response.json(
      { error: error?.message || "Could not load store files" },
      { status: 500 },
    );
  }
};
