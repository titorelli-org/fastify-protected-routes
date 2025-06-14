import { fastifyPlugin } from "fastify-plugin";
import { ProtectedRoutesPlugin } from "./ProtectedRoutesPlugin";
import type { ProtectedRoutesPluginOptions } from "./types";

export const protectedRoutes = fastifyPlugin<ProtectedRoutesPluginOptions>(
  (fastify, options) => {
    new ProtectedRoutesPlugin(fastify, options);
  },
  {
    name: "@titorelli-org/fastify-protected-routes",
  },
);
