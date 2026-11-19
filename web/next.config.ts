import type { NextConfig } from "next";

const API = process.env.API_URL || "http://localhost:8000";
// STATIC_EXPORT=1 builds plain HTML/JS into web/out, served by the FastAPI app (one service on Render).
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? { output: "export", images: { unoptimized: true } }
  : {
      // Dev / standalone: the browser talks to this origin and /api is proxied to FastAPI,
      // so the httpOnly refresh cookie stays first-party.
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
      },
    };

export default nextConfig;
