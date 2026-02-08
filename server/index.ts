import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import businessRoutes from "./businessRoutes";
import recurringRoutes from "./recurringRoutes";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ 
      databaseUrl,
      schema: 'stripe'
    });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    // Support both Replit and Azure hosting
    const hostname = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.WEBSITE_HOSTNAME;
    if (!hostname) {
      console.log('No hostname found (REPLIT_DOMAINS or WEBSITE_HOSTNAME), skipping webhook setup');
      return;
    }
    const webhookBaseUrl = hostname.startsWith('http') ? hostname : `https://${hostname}`;
    const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      {
        enabled_events: ['*'],
        description: 'Managed webhook for AtlasRide Stripe sync',
      }
    );
    console.log(`Webhook configured: ${webhook.url} (UUID: ${uuid})`);

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => {
        console.log('Stripe data synced');
      })
      .catch((err: Error) => {
        console.error('Error syncing Stripe data:', err);
      });
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

(async () => {
  await initStripe();

  // Register Stripe webhook route BEFORE express.json()
  app.post(
    '/api/stripe/webhook/:uuid',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        const { uuid } = req.params;
        await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);

        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  app.use(
    express.json({
      limit: '1mb', // Prevent large payload DoS attacks
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  // Security headers middleware
  app.use((req, res, next) => {
    // Prevent clickjacking attacks
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Enable XSS filter in browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions policy (restrict sensitive APIs)
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(app, httpServer);

  app.get('/api/downloads/investor-overview', (_req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'public', 'AtlasRide_Investor_Overview.pdf');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="AtlasRide_Investor_Overview.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  });

  // Mount business module routes (fully isolated from existing routes)
  app.use('/api/business', businessRoutes);

  // Mount recurring schedules routes
  app.use('/api/recurring-schedules', recurringRoutes);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Start payment timeout cleanup job (runs every 5 minutes)
  setInterval(async () => {
    try {
      const { cleanupStalePendingPayments, markExpiredRides } = await import('./paymentCleanup');
      await cleanupStalePendingPayments();
      await markExpiredRides();
    } catch (error) {
      console.error('Cleanup job failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  log('Payment timeout and expired rides cleanup job scheduled (every 5 minutes)');

  // Recurring schedule generation job (runs every 6 hours)
  setInterval(async () => {
    try {
      const { generateAllActiveSchedules } = await import('./recurringSchedules');
      const count = await generateAllActiveSchedules();
      if (count > 0) {
        log(`Recurring schedules: generated ${count} new listings`);
      }
    } catch (error) {
      console.error('Recurring schedule generation job failed:', error);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours

  log('Recurring schedule generation job scheduled (every 6 hours)');
})();
