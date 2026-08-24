/** @type {import('next').NextConfig} */
const nextConfig = {
  // @xenova/transformers uses onnxruntime-node under the hood, which
  // ships native binaries — keep it out of the server bundle and
  // require it at runtime instead. (Next 14 key; rename to the
  // top-level `serverExternalPackages` if you upgrade to Next 15+.)
  experimental: {
    serverComponentsExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
