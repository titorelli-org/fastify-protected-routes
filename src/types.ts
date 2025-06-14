import type { Logger } from "pino";

export type ProtectedRoutesPluginOptions = {
  origin: string;
  authorizationServers: string[];
  allRoutesRequireAuthorization?: boolean;
  logger: Logger;
  checkToken(token: string): Promise<boolean>;
};

export type RouteConfigProtected = {
  enabled: boolean;
};
