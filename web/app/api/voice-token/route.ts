import { NextRequest, NextResponse } from "next/server";

const TOKEN_TTL_SECONDS = 60;

function isTrustedBrowserRequest(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "same-site"
  ) {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host"))
    ?.split(",")[0]
    .trim();
  const source =
    request.headers.get("origin") ?? request.headers.get("referer");

  if (!source) {
    return process.env.NODE_ENV !== "production";
  }

  if (!host) {
    return false;
  }

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isTrustedBrowserRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.VOICE2ERP_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "Voice service is not configured" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const tokenUrl = new URL("https://agents.assemblyai.com/v1/token");
  tokenUrl.searchParams.set("product", "voice_agent");
  tokenUrl.searchParams.set(
    "expires_in_seconds",
    String(TOKEN_TTL_SECONDS),
  );

  try {
    const response = await fetch(tokenUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "AssemblyAI token request failed",
        response.status,
        response.statusText,
      );

      return NextResponse.json(
        { error: "Could not start voice session" },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const data: unknown = await response.json();

    if (
      !data ||
      typeof data !== "object" ||
      !("token" in data) ||
      typeof data.token !== "string" ||
      !data.token
    ) {
      console.error("AssemblyAI token response did not contain a token");

      return NextResponse.json(
        { error: "Could not start voice session" },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        token: data.token,
        agent_id: agentId,
        expires_in_seconds: TOKEN_TTL_SECONDS,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("AssemblyAI token request failed", error);

    return NextResponse.json(
      { error: "Could not start voice session" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
