import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whois', '@supabase/ssr', '@supabase/supabase-js'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
