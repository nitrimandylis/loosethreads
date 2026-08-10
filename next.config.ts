import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits in the bottom-left corner, which is where the
  // board's own step-back tab lives. Off, so what you see while developing is
  // what a visitor sees.
  devIndicators: false,
};

export default nextConfig;
