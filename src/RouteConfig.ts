import type {FastifyRequest, FastifyReply, RouteOptions} from "fastify";
import type {ProtectedRoutesPlugin} from "./ProtectedRoutesPlugin";
import type {RouteConfigProtected} from "./types";

export class RouteConfig {
    constructor(
        private readonly plugin: ProtectedRoutesPlugin,
        private readonly routeOptions: RouteOptions,
    ) {
    }

    public shouldSkipRoute() {
        return [
            this.shouldSkipRouteBecauseOfMethod,
            this.shouldSkipRouteBecauseItsResourceMetadata,
            this.shouldSkipRouteBecauseAuthorizationNotRequired,
        ].some((fn) => fn.call(this));
    }

    public installPreValidationHook(
        authValidator: (
            routeConfig: RouteConfig,
            request: FastifyRequest<any>,
            reply: FastifyReply
        ) => Promise<void>,
    ) {
        let preValidation = this.routeOptions.preValidation;

        if (preValidation == null) {
            preValidation = [authValidator.bind(this, this)];
        } else if (typeof preValidation === "function") {
            preValidation = [authValidator.bind(this, this), preValidation];
        } else if (Array.isArray(preValidation)) {
            preValidation.unshift(authValidator.bind(this, this));
        }

        this.routeOptions.preValidation = preValidation;
    }

    public getResourceMetadataPath() {
        const {routePath} = this;

        return `/.well-known/oauth-protected-resource${
            routePath === "/" ? "" : routePath
        }`;
    }

    public interpolateResourcePath(params: Record<string, any>) {
        const {routePath} = this;

        let resolvedPathname = routePath;

        for (const [key, val] of Object.entries(params)) {
            const re = new RegExp(`\\:${key}`, "gi");

            resolvedPathname = resolvedPathname.replace(re, String(val));
        }

        return resolvedPathname;
    }

    public getSupportedScopes() {
        const {scopesSupported} = this.getRouteProtectedConfig();

        if (!scopesSupported) {
            return [];
        }

        return scopesSupported;
    }

    private get resourceMetadataSymbol() {
        return this.plugin.resourceMetadataSymbol;
    }

    private get allRoutesRequireAuthorization() {
        return this.plugin.allRoutesRequireAuthorization;
    }

    private get routePath(): string {
        return Reflect.get(this.routeOptions, "path") ?? this.routeOptions.url;
    }

    private shouldSkipRouteBecauseOfMethod() {
        const {method} = this.routeOptions;

        switch (method) {
            case "HEAD":
            case "OPTIONS":
                return true;
            default:
                return false;
        }
    }

    private shouldSkipRouteBecauseItsResourceMetadata() {
        const {config} = this.routeOptions;

        if (config) {
            const skip = Reflect.get(config, this.resourceMetadataSymbol);

            if (skip) {
                return true;
            }
        }

        return false;
    }

    private shouldSkipRouteBecauseAuthorizationNotRequired() {
        return !this.getRouteRequireAuthorization();
    }

    private getRouteRequireAuthorization() {
        if (this.routeHasProtectedConfig()) {
            const {enabled} = this.getRouteProtectedConfig();

            return enabled;
        } else {
            return this.allRoutesRequireAuthorization;
        }
    }

    private routeHasProtectedConfig() {
        const {config} = this.routeOptions;

        if (config == null) return false;

        const maybeConfig = Reflect.get(config, "protected");

        if (maybeConfig == null) return false;

        return true;
    }

    private getRouteProtectedConfig(): RouteConfigProtected {
        const protectedConfig = Reflect.get(this.routeOptions.config ?? {}, 'protected') as
            | RouteConfigProtected
            | boolean
            | null
            | undefined;

        if (protectedConfig == null) {
            return {enabled: false};
        }

        if (typeof protectedConfig === "boolean") {
            return {
                enabled: protectedConfig,
            };
        }

        return protectedConfig;
    }
}
