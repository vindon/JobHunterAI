import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * API proxy — rewrites /api/* to the FastAPI backend running on :8000.
   * This avoids CORS issues during development: the browser talks only to
   * Next.js (:3000), which forwards API calls to FastAPI (:8000) server-side.
   *
   * In production (if ever deployed), replace the destination with your
   * actual API base URL or remove these rewrites if FastAPI is behind the
   * same origin.
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
