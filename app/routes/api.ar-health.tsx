// GET /api/ar-health — quick check which AR API build is answering
import { API_VERSION } from "../ar-api-version.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  return Response.json(
    {
      ok: true,
      apiVersion: API_VERSION,
      service: "ar-preview",
      time: new Date().toISOString(),
    },
    { headers: CORS },
  );
}
