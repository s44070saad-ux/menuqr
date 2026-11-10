/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Menu / logo / cover images come from Supabase Storage and arbitrary
    // owner-pasted URLs. Allow remote https images without a domain allowlist
    // dance — owners paste URLs from many hosts.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};
export default nextConfig;
