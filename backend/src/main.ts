import { RequestAdmission } from "./common/security/request-admission";
import { allowedOrigins } from "./common/security/cors-origin";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const logger = new Logger("QuizNaBootstrap");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  // Trust only a configured proxy hop count; local headers cannot spoof a client IP.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0 && proxyHops <= 3)
    app.set("trust proxy", proxyHops);
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader("Cache-Control", "private, no-store");
    if (process.env.NODE_ENV === "production")
      response.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  app.enableCors({
    origin: allowedOrigins(process.env),
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    exposedHeaders: ["Retry-After"],
  });

  const admission = new RequestAdmission();
  app.use(admission.handle);
  // Reject compressed request bodies and oversized JSON before validation/DB work.
  app.useBodyParser("json", { limit: "512kb", inflate: false });
  app.useBodyParser("urlencoded", {
    limit: "16kb",
    extended: false,
    parameterLimit: 32,
    inflate: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT || 3002;
  await app.listen(
    port,
    process.env.DEMO_MODE === "true" ? "127.0.0.1" : "0.0.0.0",
  );
  const server = app.getHttpServer();
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 1000;
  server.setTimeout(90000);
  logger.log(`QuizNa API is listening on port ${port}`);
}

bootstrap();
