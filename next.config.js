/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["better-sqlite3"]
};

module.exports = nextConfig;
