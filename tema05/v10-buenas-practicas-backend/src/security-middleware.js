import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { resolveDemoUser } from "./security-policy.js";

export function configureSecurity(app) {
  app.use(helmet());

  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Demasiadas peticiones. Inténtalo de nuevo en unos segundos."
    }
  }));

  app.use((req, res, next) => {
    const user = resolveDemoUser(req);

    req.securityContext = {
      userId: user.userId,
      displayName: user.displayName,
      role: user.role,
      permissions: user.permissions
    };

    next();
  });
}

export function getSecurityContext(req) {
  return req.securityContext || {
    userId: "anonymous",
    displayName: "Anonymous",
    role: "usuario_estandar",
    permissions: {}
  };
}
