import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opt pdf-parse and its pdfjs-dist dependency out of Turbopack bundling.
  // They use Node.js native modules and must run via native require, not as
  // Turbopack chunks — otherwise the pdfjs worker path resolution breaks.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
