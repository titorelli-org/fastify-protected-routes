import type { Logger } from "pino";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import createError from "@fastify/error";
import type { ProtectedRoutesPluginOptions } from "./types";
import { RouteConfig } from "./RouteConfig";

export class ProtectedRoutesPlugin {
  private readonly UnauthorizedError = createError(
    "UNAUTHORIZED",
    "Unauthorized",
    401,
  );
  private readonly origin: string;
  private readonly authorizationServers: string[];
  private readonly checkTokenImpl: (token: string) => Promise<boolean>;
  private readonly logger: Logger;

  public readonly resourceMetadataSymbol = Symbol("resource-metadata");
  public readonly allRoutesRequireAuthorization: boolean;

  constructor(
    private readonly fastify: FastifyInstance,
    {
      origin,
      authorizationServers,
      allRoutesRequireAuthorization,
      logger,
      checkToken,
    }: ProtectedRoutesPluginOptions,
  ) {
    this.origin = origin;
    this.authorizationServers = authorizationServers;
    this.allRoutesRequireAuthorization = allRoutesRequireAuthorization ?? false;
    this.logger = logger;
    this.checkTokenImpl = checkToken;

    this.initialize();
  }

  private initialize() {
    this.fastify.addHook("onRoute", (routeOptions) => {
      const routeConfig = new RouteConfig(this, routeOptions);

      if (routeConfig.shouldSkipRoute()) return;

      routeConfig.installPreValidationHook(this.authValidator);

      try {
        this.fastify.get(
          routeConfig.getResourceMetadataPath(),
          {
            config: { [this.resourceMetadataSymbol]: true },
          },
          async (request, reply) => {
            reply.headers({ "content-type": "application/json" });

            const resolvedPathname = routeConfig.interpolateResourcePath(
              request.params,
            );

            return {
              resource: `${this.origin}${resolvedPathname}`,
              authorization_servers: this.authorizationServers,
              scopes_supported: routeConfig.getSupportedScopes(),
              bearer_methods_supported: ["body"],
            };
          },
        );
      } catch (err) {
        if (err.code === "FST_ERR_DUPLICATED_ROUTE") {
          // Suppress error for duplicate metadata routes
        } else {
          throw err;
        }
      }
    });
  }

  private authValidator = async (
    request: FastifyRequest<any>,
    reply: FastifyReply,
  ) => {
    const authorizationHeaderValue = request.headers.authorization ?? "";
    const token = authorizationHeaderValue.startsWith("Bearer")
      ? authorizationHeaderValue.slice(7)
      : null;
    const valid = await this.checkToken(token);

    if (!valid) {
      reply.headers({
        "www-authenticate": `Bearer resource_metadata="${this.getResourceMetadataUrl(
          request.url,
        )}"`,
      });

      throw new this.UnauthorizedError();
    }
  };

  private async checkToken(token: string | null) {
    if (token == null) return false;

    try {
      return this.checkTokenImpl(token);
    } catch (err) {
      this.logger.error(err);

      return false;
    }
  }

  private getResourceMetadataUrl(requestUrl: string) {
    const { pathname } = new URL(requestUrl, this.origin);
    const resourceMetadataUrl = new URL(
      "/.well-known/oauth-protected-resource",
      this.origin,
    );

    if (pathname !== "/") {
      resourceMetadataUrl.pathname = `${resourceMetadataUrl.pathname}${pathname}`;
    }

    return resourceMetadataUrl.toString();
  }
}
