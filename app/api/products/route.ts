import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";

async function proxy(request: NextRequest, targetPath: string, method = request.method) {
  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();

  const response = await fetch(`${request.nextUrl.origin}${targetPath}`, {
    method,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
      Authorization: request.headers.get("authorization") || "",
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control":
        response.headers.get("cache-control") ||
        "public, s-maxage=60, stale-while-revalidate=300",
      "X-Total-Count": response.headers.get("X-Total-Count") || "",
      "X-Page": response.headers.get("X-Page") || "",
      "X-Limit": response.headers.get("X-Limit") || "",
      "X-Total-Pages": response.headers.get("X-Total-Pages") || "",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const targetPath = id
    ? `/api/items/${encodeURIComponent(id)}?${searchParams.toString()}`
    : `/api/items?${searchParams.toString()}`;
  return proxy(request, targetPath, "GET");
}

export async function POST(request: NextRequest) {
  return proxy(request, "/api/items/create", "POST");
}

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }
  return proxy(request, `/api/items/${encodeURIComponent(id)}`, "PUT");
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }
  return proxy(request, `/api/items/${encodeURIComponent(id)}`, "DELETE");
}
