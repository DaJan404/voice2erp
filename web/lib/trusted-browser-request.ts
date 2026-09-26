import { NextRequest } from "next/server";

export function isTrustedBrowserRequest(request: NextRequest) {
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
