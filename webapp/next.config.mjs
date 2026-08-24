
const nextConfig = {

  experimental: {
    serverComponentsExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
