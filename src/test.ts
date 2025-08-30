import fastify from "fastify";
import { protectedRoutes, TokenValidator } from "./index";
import pino from "pino";

const app = fastify();

app
  .register(protectedRoutes, {
    origin: "http://localhost:3000",
    authorizationServers: ["http://localhost:3000"],
    allRoutesRequireAuthorization: true,
    logger: pino(),
    checkToken(token, url, supportedScopes) {

        console.log({token, url, supportedScopes});

      return Promise.resolve(true);
    },
  })
  .then(() => {
    app.get("/", () => "Hello, world!");
    app.post("/", () => "Hello, world!");
    app.get("/protected", () => "Hello, world!");
    app.get("/protected/:arg", () => "Hello, world!");

      app.get('/protected/with-scopes', {
          // @ts-ignore
        protected: {
            scopesSupported: ['foo', 'bar']
        }
    }, () => "Hello, world!");

      app.get('/protected/with-scopes/:arg', {
          // @ts-ignore
          protected: {
              scopesSupported: ['foo', 'bar']
          }
      }, () => "Hello, world!");
  })
  .then(() => {
    app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  });
