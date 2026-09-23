import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("query")?.trim();

    if (!query) {
        return NextResponse.json(
            { error: "Missing customer query" },
            { status: 400 },
        );
    }

    const baseUrl = process.env.VOICE2ERP_API_BASE;
    const token = process.env.VOICE2ERP_VERIFY_TOKEN;

    if (!baseUrl || !token) {
        return NextResponse.json(
            { error: "Verification service is not configured" },
            { status: 503 },
        );
    }

    const response = await fetch(
        `${baseUrl}/api/verify/customer?query=${encodeURIComponent(query)}`,
        {
            headers: {
                "X-VOICE2ERP-VERIFY-TOKEN": token,
            },
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
}