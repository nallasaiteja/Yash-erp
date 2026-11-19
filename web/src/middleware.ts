import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rawApi = process.env.API_URL || "http://localhost:8000";
    const base =
      rawApi.startsWith("http://") || rawApi.startsWith("https://")
        ? rawApi
        : rawApi.includes(":")
          ? `http://${rawApi}`
          : `https://${rawApi}`;
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, base);
    return NextResponse.rewrite(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
