/** @type {import('next').NextConfig} */
const nextConfig = {
  // esbuild contiene un file eseguibile: non va "impacchettato" da Next
  serverExternalPackages: ["esbuild"],
};
export default nextConfig;
