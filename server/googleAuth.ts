import type { Express, Request } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import { storage } from "./storage";

function getCallbackURL(req: Request): string {
  const protocol = req.protocol === "http" && req.hostname !== "localhost" ? "https" : req.protocol;
  return `${protocol}://${req.get("host")}/api/auth/google/callback`;
}

let strategyRegistered = false;

function ensureStrategy(): boolean {
  if (strategyRegistered) return true;

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) return false;

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: "/api/auth/google/callback",
        passReqToCallback: true,
      },
      async (
        _req: Request,
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase().trim();
          if (!email) {
            return done(new Error("Google account did not return an email address"));
          }

          let user = await storage.getUserByEmail(email);

          if (!user) {
            // First-time Google sign-in is treated as legal acceptance.
            // The Google sign-in button surfaces a clear consent disclaimer
            // linking to /terms and /privacy before this code path is reached.
            const acceptedAt = new Date();
            user = await storage.createUser({
              email,
              authProvider: "google",
              emailVerified: true,
              firstName: profile.name?.givenName ?? profile.displayName?.split(" ")[0] ?? "",
              lastName:
                profile.name?.familyName ??
                profile.displayName?.split(" ").slice(1).join(" ") ??
                "",
              profileImageUrl: profile.photos?.[0]?.value,
              termsAcceptedAt: acceptedAt,
              privacyAcceptedAt: acceptedAt,
            });
          }

          return done(null, { id: user.id, email: user.email });
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  strategyRegistered = true;
  return true;
}

export function isGoogleAuthEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function setupGoogleAuth(app: Express) {
  if (!isGoogleAuthEnabled()) {
    console.log(
      "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google sign-in disabled",
    );
    return;
  }

  ensureStrategy();
  console.log("[auth] Google sign-in enabled");

  app.get("/api/auth/google", (req, res, next) => {
    if (!ensureStrategy()) {
      return res.redirect("/login?error=google_disabled");
    }
    passport.authenticate("google", {
      scope: ["profile", "email"],
      callbackURL: getCallbackURL(req),
      session: false,
      // CSRF protection: passport-oauth2 stores a nonce in req.session
      // (key 'oauth2:google') and verifies it on the callback.
      state: true,
    } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    if (!ensureStrategy()) {
      return res.redirect("/login?error=google_disabled");
    }
    passport.authenticate("google", {
      callbackURL: getCallbackURL(req),
      session: false,
      state: true,
      failureRedirect: "/login?error=google_failed",
    } as any)(req, res, (err: any) => {
      if (err) {
        console.error("[auth] Google callback error:", err);
        return res.redirect("/login?error=google_failed");
      }
      const user = (req as any).user as { id: string; email: string | null } | undefined;
      if (!user) {
        return res.redirect("/login?error=google_failed");
      }

      (req.session as any).userId = user.id;
      (req.session as any).user = { claims: { sub: user.id } };

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[auth] Session save error after Google login:", saveErr);
          return res.redirect("/login?error=google_failed");
        }
        res.redirect("/");
      });
    });
  });

  // Public probe endpoint so the client can show / hide the Google button
  // without leaking credentials.
  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ enabled: isGoogleAuthEnabled() });
  });
}
