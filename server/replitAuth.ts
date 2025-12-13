import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID!;
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID!;
const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET!;

const getOidcConfig = memoize(
  async () => {
    // External ID (CIAM) uses ciamlogin.com domain
    const issuerUrl = `https://${ENTRA_TENANT_ID}.ciamlogin.com/${ENTRA_TENANT_ID}/v2.0`;
    return await client.discovery(
      new URL(issuerUrl),
      ENTRA_CLIENT_ID,
      ENTRA_CLIENT_SECRET
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  // Entra ID uses different claim names than Replit
  // 'sub' is the unique user identifier
  // 'name' is the display name
  // 'email' or 'preferred_username' for email
  // 'given_name' for first name
  // 'family_name' for last name
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"] || claims["preferred_username"],
    firstName: claims["given_name"] || claims["name"]?.split(" ")[0] || null,
    lastName: claims["family_name"] || claims["name"]?.split(" ").slice(1).join(" ") || null,
    profileImageUrl: null, // Entra ID doesn't provide profile image in standard claims
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `entra:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`entra:${req.hostname}`, {
      prompt: "select_account",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  // Handle both GET and POST for callback (Azure may use form_post response mode)
  const callbackHandler = (req: any, res: any, next: any) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`entra:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  };
  app.get("/api/callback", callbackHandler);
  app.post("/api/callback", callbackHandler);

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      // External ID (CIAM) logout endpoint
      const logoutUrl = `https://${ENTRA_TENANT_ID}.ciamlogin.com/${ENTRA_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(`https://${req.hostname}`)}`;
      res.redirect(logoutUrl);
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
