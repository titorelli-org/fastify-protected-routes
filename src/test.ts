import fastify from "fastify";
import { protectedRoutes } from "./index";
import pino from "pino";

const app = fastify();

app
  .register(protectedRoutes, {
    origin: "http://localhost:3000",
    authorizationServers: ["http://localhost:3000"],
    allRoutesRequireAuthorization: true,
    logger: pino(),
    checkToken(token) {
      return Promise.resolve(true);
    },
  })
  .then(() => {
    app.get("/", () => "Hello, world!");
    app.post("/", () => "Hello, world!");
    app.get("/protected", () => "Hello, world!");
    app.get("/protected/:arg", () => "Hello, world!");
  })
  .then(() => {
    app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  });
