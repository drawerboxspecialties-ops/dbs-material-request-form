import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "frame-ancestors",
              "'self'",
              "https://dbs-rta-quote-calculator.vercel.app",
              "https://*.vercel.app",
              "https://drawerboxspecialties-ops.github.io",
            ].join(" "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
