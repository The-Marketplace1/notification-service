import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const protectedRoutes = ["/events", "/notifications", "/templates", "/logs"];

  const isProtected =
    protectedRoutes.some((route) => req.path === route || req.path.startsWith(`${route}/`));

  if (!isProtected) {
    next();
    return;
  }

  const secret = process.env.SERVICE_SECRET;

  if (!secret || req.header("x-service-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
});

app.use(router);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  req.log.error({ err }, "Unhandled error");
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

export default app;
