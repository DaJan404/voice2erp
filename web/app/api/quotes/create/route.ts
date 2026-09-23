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
      { error: "Invalid quote confirmation" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const confirmationToken =
    "confirmation_token" in body &&
    typeof body.confirmation_token === "string"
      ? body.confirmation_token
      : "";
  const requestId =
    "request_id" in body && typeof body.request_id === "string"
      ? body.request_id
      : "";

  if (!confirmationToken || !requestId) {
    return NextResponse.json(
      { error: "Missing quote confirmation" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const baseUrl = process.env.VOICE2ERP_API_BASE;
  const token = process.env.VOICE2ERP_EXECUTE_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Quote execution service is not configured" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const response = await fetch(
      new URL("/api/quotes/create", baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VOICE2ERP-EXECUTE-TOKEN": token,
        },
        body: JSON.stringify({
          confirmation_token: confirmationToken,
          request_id: requestId,
        }),
        cache: "no-store",
      },
    );
    const data: unknown = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Quote creation request failed", error);

    return NextResponse.json(
      { error: "Could not create sales quote" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
