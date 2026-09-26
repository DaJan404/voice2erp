import { NextRequest, NextResponse } from "next/server";

import { isTrustedBrowserRequest } from "@/lib/trusted-browser-request";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid quote request" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const customerQuery =
    "customer_query" in body && typeof body.customer_query === "string"
      ? body.customer_query.trim()
      : "";
  const itemQuery =
    "item_query" in body && typeof body.item_query === "string"
      ? body.item_query.trim()
      : "";
  const quantity =
    "quantity" in body && typeof body.quantity === "number"
      ? body.quantity
      : Number.NaN;

  if (
    !customerQuery ||
    !itemQuery ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return NextResponse.json(
      { error: "Customer, item and a positive quantity are required" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const baseUrl = process.env.VOICE2ERP_API_BASE;
  const token = process.env.VOICE2ERP_VERIFY_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Quote preparation service is not configured" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const url = new URL("/api/quotes/prepare", baseUrl);
  url.searchParams.set("customer_query", customerQuery);
  url.searchParams.set("item_query", itemQuery);
  url.searchParams.set("quantity", String(quantity));

  try {
    const response = await fetch(url, {
      headers: {
        "X-VOICE2ERP-VERIFY-TOKEN": token,
      },
      cache: "no-store",
    });
    const data: unknown = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Quote preparation request failed", error);

    return NextResponse.json(
      { error: "Could not prepare sales quote" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
