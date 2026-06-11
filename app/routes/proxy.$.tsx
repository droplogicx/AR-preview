// Shopify App Proxy: https://{shop}/apps/ar-preview/* → /proxy/*
import { authenticate } from "../shopify.server";
import { loader as arModelLoader, action as arModelAction } from "./api.ar-model";
import { loader as arModelFileLoader } from "./api.ar-model.file.$name";
import { loader as arViewLoader } from "./ar.view";

async function verifyProxy(request: Request) {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // Allow direct /proxy access during local dev without signature
    const url = new URL(request.url);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
    throw new Response("Unauthorized", { status: 401 });
  }
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { "*"?: string };
}) {
  await verifyProxy(request);
  const subpath = (params["*"] || "").replace(/^\//, "");

  if (subpath === "api/ar-model") {
    return arModelLoader({ request });
  }

  if (subpath.startsWith("api/ar-model/file/")) {
    const name = subpath.slice("api/ar-model/file/".length);
    return arModelFileLoader({ request, params: { name } });
  }

  if (subpath === "ar/view" || subpath.startsWith("ar/view?")) {
    return arViewLoader({ request });
  }

  return new Response("Not found", { status: 404 });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { "*"?: string };
}) {
  await verifyProxy(request);
  const subpath = (params["*"] || "").replace(/^\//, "");

  if (subpath === "api/ar-model") {
    return arModelAction({ request });
  }

  return new Response("Not found", { status: 404 });
}
