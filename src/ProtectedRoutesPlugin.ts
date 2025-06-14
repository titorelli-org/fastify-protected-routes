import type { Logger } from "pino";
import {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteOptions,
} from "fastify";
import createError from "@fastify/error";
import type {
  ProtectedRoutesPluginOptions,
  RouteConfigProtected,
} from "./types";

export class ProtectedRoutesPlugin {
  private readonly resourceMetadataSymbol = Symbol("resource-metadata");
  private readonly protectedResourceSymbol = Symbol("protected-resource");
  private readonly UnauthorizedError = createError(
    "UNAUTHORIZED",
    "Unauthorized",
    401,
  );
  private readonly origin: string;
  private readonly authorizationServers: string[];
  private readonly allRoutesRequireAuthorization: boolean;
  private readonly checkTokenImpl: (token: string) => Promise<boolean>;
  private readonly logger: Logger;

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
    this.allRoutesRequireAuthorization = allRoutesRequireAuthorization;
    this.logger = logger;
    this.checkTokenImpl = checkToken;
    this.initialize();
  }

  private initialize() {
    this.fastify.addHook("onRoute", (routeOptions) => {
      if (this.shouldSkipRoute(routeOptions)) return;

      this.installPreValidationHook(routeOptions);

      try {
        this.fastify.get(
          this.getResourceMetadataPath(routeOptions.path),
          {
            config: { [this.resourceMetadataSymbol]: true },
          },
          async (request, reply) => {
            reply.headers({ "content-type": "application/json" });

            const resolvedPathname = this.interpolateResourcePath(
              routeOptions.path,
              request.params,
            );

            return {
              resource: `${this.origin}${resolvedPathname}`,
              authorization_servers: this.authorizationServers,
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

  private interpolateResourcePath(
    routePath: string,
    params: Record<string, any>,
  ) {
    let resolvedPathname = routePath;

    for (const [key, val] of Object.entries(params)) {
      const re = new RegExp(`\\:${key}`, "gi");

      resolvedPathname = resolvedPathname.replace(re, String(val));
    }

    return resolvedPathname;
  }

  private installPreValidationHook(routeOptions: RouteOptions) {
    let preValidation = routeOptions.preValidation;

    if (preValidation == null) {
      preValidation = [this.authValidator];
    } else if (typeof preValidation === "function") {
      preValidation = [this.authValidator, preValidation];
    } else if (Array.isArray(preValidation)) {
      preValidation.unshift(this.authValidator);
    }

    routeOptions.preValidation = preValidation;
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

  private getResourceMetadataPath(routePath: string) {
    return `/.well-known/oauth-protected-resource${
      routePath === "/" ? "" : routePath
    }`;
  }

  private shouldSkipRoute(routeOptions: RouteOptions) {
    return [
      this.shouldSkipRouteBecauseOfMethod,
      this.shouldSkipRouteBecauseItsResourceMetadata,
      this.shouldSkipRouteBecauseAuthorizationNotRequired,
    ].some((fn) => fn(routeOptions));
  }

  private shouldSkipRouteBecauseOfMethod = ({ method }: RouteOptions) => {
    switch (method) {
      case "HEAD":
      case "OPTIONS":
        return true;
      default:
        return false;
    }
  };

  private shouldSkipRouteBecauseItsResourceMetadata = ({
    config,
  }: RouteOptions) => {
    if (config) {
      const skip = Reflect.get(config, this.resourceMetadataSymbol);

      if (skip) {
        return true;
      }
    }

    return false;
  };

  private shouldSkipRouteBecauseAuthorizationNotRequired = (
    routeOptions: RouteOptions,
  ) => {
    const requireAuthorization =
      this.getRouteRequireAuthorization(routeOptions);

    return !requireAuthorization;
  };

  private getRouteRequireAuthorization(routeOptions: RouteOptions) {
    if (this.allRoutesRequireAuthorization) {
      return true;
    }

    const { enabled } = this.getRouteProtectedConfig(routeOptions);

    return enabled;
  }

  private getRouteProtectedConfig({
    config,
  }: RouteOptions): RouteConfigProtected {
    if (config) {
      const protectedConfig = Reflect.get(config, "protected") as
        | RouteConfigProtected
        | boolean;

      if (typeof protectedConfig === "boolean") {
        return {
          enabled: protectedConfig,
        };
      }

      return (
        protectedConfig ?? {
          enabled: false,
        }
      );
    }

    return {
      enabled: false,
    };
  }
}
