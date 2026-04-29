import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// ── Brand colours ────────────────────────────────────────────────────────────
const BRAND   = '#0E7490';
const DARK    = '#1E293B';
const MID     = '#475569';
const LIGHT   = '#94A3B8';
const RED     = '#DC2626';
const AMBER   = '#D97706';
const GREEN   = '#16A34A';
const PURPLE  = '#7C3AED';
const BG_BLUE = '#F0F9FF';
const BG_GREY = '#F8FAFC';

const outputPath = path.join(process.cwd(), 'public', 'AtlasRide_Azure_Full_Config.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
doc.pipe(fs.createWriteStream(outputPath));

const W  = doc.page.width - 100;   // usable width
const PW = doc.page.width;
const PH = doc.page.height;

// ── Helpers ──────────────────────────────────────────────────────────────────

function header(pageTitle = '') {
  doc.rect(0, 0, PW, 52).fill(BRAND);
  doc.fillColor('white').fontSize(14).font('Helvetica-Bold').text('AtlasRide', 50, 14);
  doc.fillColor('white').fontSize(8).font('Helvetica').text('Azure Full Configuration Reference', 50, 32);
  if (pageTitle) {
    doc.fillColor('#BAE6FD').fontSize(9).font('Helvetica-Bold').text(pageTitle, 0, 32, { width: PW - 50, align: 'right' });
  }
  doc.y = 70;
  doc.fillColor(DARK);
}

function footer() {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fontSize(7.5).fillColor(LIGHT).font('Helvetica').text(
      `AtlasRide — Azure Configuration Reference  ·  Page ${i + 1} of ${range.count}  ·  ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      50, PH - 38, { width: W, align: 'center' }
    );
  }
}

function sectionBanner(emoji: string, title: string, subtitle: string, color = BRAND) {
  doc.moveDown(0.6);
  const bY = doc.y;
  doc.rect(50, bY, W, 36).fill(color);
  doc.fillColor('white').fontSize(13).font('Helvetica-Bold').text(`${emoji}  ${title}`, 62, bY + 8, { width: W - 80 });
  doc.fillColor('#BAE6FD').fontSize(8).font('Helvetica').text(subtitle, 62, bY + 23, { width: W - 80 });
  doc.y = bY + 44;
  doc.fillColor(DARK);
}

function subHead(title: string, color = BRAND) {
  doc.moveDown(0.5);
  doc.fillColor(color).fontSize(10).font('Helvetica-Bold').text(title, 50, doc.y, { width: W });
  doc.fillColor(DARK).fontSize(9).font('Helvetica');
  doc.moveDown(0.15);
}

function body(text: string, indent = 0) {
  doc.fillColor(DARK).fontSize(9).font('Helvetica').text(text, 50 + indent, doc.y, { width: W - indent });
}

function note(text: string, color = BRAND) {
  doc.moveDown(0.35);
  const nY = doc.y;
  const nh = doc.heightOfString(text, { width: W - 20 });
  doc.rect(50, nY, W, nh + 12).fill(color + '18');
  doc.rect(50, nY, 3, nh + 12).fill(color);
  doc.fillColor(color).fontSize(8.5).font('Helvetica-Bold').text(text, 62, nY + 6, { width: W - 22 });
  doc.y = nY + nh + 18;
  doc.fillColor(DARK);
}

function codeBlock(lines: string[], label = '') {
  doc.moveDown(0.3);
  const text = lines.join('\n');
  const th = doc.heightOfString(text, { width: W - 24, lineGap: 3 });
  const boxH = th + 20 + (label ? 16 : 0);
  const bY = doc.y;
  doc.rect(50, bY, W, boxH).fill('#1E293B');
  if (label) {
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(label, 62, bY + 6, { width: W - 24 });
  }
  doc.fillColor('#34D399').fontSize(8.5).font('Helvetica').text(text, 62, bY + (label ? 18 : 10), { width: W - 24, lineGap: 3 });
  doc.y = bY + boxH + 8;
  doc.fillColor(DARK);
}

type TableRow = { name: string; value: string; type?: string; color?: string };

function configTable(rows: TableRow[], showType = true) {
  const COL = showType ? [180, 230, 80] : [190, 300];
  const ROW_H = 20;
  const x = 50;
  let y = doc.y + 4;

  // header
  doc.rect(x, y, W, ROW_H).fill(DARK);
  doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
  doc.text('Setting Name', x + 6, y + 6, { width: COL[0] });
  doc.text('Value / Description', x + COL[0] + 6, y + 6, { width: COL[1] });
  if (showType) doc.text('Required', x + COL[0] + COL[1] + 6, y + 6, { width: COL[2] });
  y += ROW_H;

  rows.forEach((row, i) => {
    const alt = i % 2 === 0;
    doc.rect(x, y, W, ROW_H).fill(alt ? BG_BLUE : 'white');

    const tc = row.color === 'red' ? RED : row.color === 'amber' ? AMBER : row.color === 'green' ? GREEN : row.color === 'purple' ? PURPLE : BRAND;

    doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold').text(row.name, x + 6, y + 6, { width: COL[0] - 8 });
    doc.fillColor(MID).font('Helvetica').text(row.value, x + COL[0] + 6, y + 6, { width: COL[1] - 8 });
    if (showType && row.type) {
      doc.fillColor(tc).font('Helvetica-Bold').text(row.type, x + COL[0] + COL[1] + 6, y + 6, { width: COL[2] - 4 });
    }
    y += ROW_H;
  });

  doc.y = y + 8;
  doc.fillColor(DARK);
}

function stepBox(num: string, title: string, lines: string[]) {
  doc.moveDown(0.4);
  const bY = doc.y;
  const fullText = lines.join('\n');
  const th = doc.heightOfString(fullText, { width: W - 70, lineGap: 3 });
  const boxH = th + 22;

  doc.rect(50, bY, W, boxH).fill(BG_GREY);
  doc.rect(50, bY, 36, boxH).fill(BRAND);
  doc.fillColor('white').fontSize(14).font('Helvetica-Bold').text(num, 50, bY + (boxH / 2) - 10, { width: 36, align: 'center' });
  doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text(title, 94, bY + 6, { width: W - 54 });
  doc.fillColor(MID).fontSize(8.5).font('Helvetica').text(fullText, 94, bY + 19, { width: W - 54, lineGap: 3 });

  doc.y = bY + boxH + 6;
  doc.fillColor(DARK);
}

function checkGrid(items: { label: string; sub?: string }[]) {
  const colW = W / 2 - 4;
  const rowH = 28;
  let x = 50;
  let y = doc.y + 4;

  items.forEach((item, i) => {
    const isRight = i % 2 === 1;
    const cx = isRight ? 50 + colW + 8 : 50;
    doc.rect(cx, y, colW, rowH).fill(i % 4 < 2 ? BG_BLUE : 'white').stroke('#E2E8F0');
    doc.rect(cx + 6, y + 9, 10, 10).stroke(BRAND);
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text(item.label, cx + 22, y + 6, { width: colW - 28 });
    if (item.sub) doc.fillColor(MID).fontSize(7).font('Helvetica').text(item.sub, cx + 22, y + 17, { width: colW - 28 });
    if (isRight || i === items.length - 1) y += rowH + 2;
  });
  doc.y = y + 4;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — Cover
// ═══════════════════════════════════════════════════════════════════════════════
header();

doc.rect(0, 52, PW, 3).fill('#0891B2');

doc.moveDown(0.8);
doc.fillColor(BRAND).fontSize(28).font('Helvetica-Bold').text('Azure Full', 50, doc.y);
doc.fillColor(DARK).fontSize(28).font('Helvetica').text('Configuration Reference');
doc.moveDown(0.3);
doc.fillColor(MID).fontSize(11).font('Helvetica')
   .text('Every service, API, database, and setting required to run AtlasRide on Azure App Services — with specific values where known.', { width: W });
doc.moveDown(0.25);
doc.fillColor(LIGHT).fontSize(8).text(`Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  AtlasRide Engineering`);

doc.moveDown(0.8);
doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor(BRAND).lineWidth(1).stroke();
doc.moveDown(0.6);

// Contents
subHead('Contents');
const toc = [
  ['1', 'Azure App Service Settings', '2'],
  ['2', 'PostgreSQL Database', '2'],
  ['3', 'Environment Variables — Complete Reference', '3'],
  ['4', 'Azure Maps', '4'],
  ['5', 'Stripe Payments', '4'],
  ['6', 'Twilio SMS', '5'],
  ['7', 'Microsoft Entra External ID (Email OTP)', '5'],
  ['8', 'Mapbox (Optional)', '6'],
  ['9', 'GitHub Actions Deployment Workflow', '6'],
  ['10', 'Go-Live Checklist', '7'],
];
toc.forEach(([num, title, pg]) => {
  const tY = doc.y;
  doc.fillColor(BRAND).fontSize(9).font('Helvetica-Bold').text(`${num}.`, 50, tY, { width: 18 });
  doc.fillColor(DARK).font('Helvetica').text(title, 68, tY, { width: W - 80 });
  doc.fillColor(LIGHT).text(`p.${pg}`, 50, tY, { width: W, align: 'right' });
  doc.moveDown(0.3);
});

doc.moveDown(0.5);
note('This document contains environment variable names and service configuration details. Keep it secure. Never commit real secrets to version control.', RED);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — Azure App Service + Database
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Azure App Service + Database');

sectionBanner('⚙️', '1. Azure App Service Settings', 'Configuration → General Settings in the Azure Portal');

configTable([
  { name: 'Runtime Stack', value: 'Node.js', type: 'Required', color: 'red' },
  { name: 'Node.js Version', value: '24 LTS  (matches GitHub Actions workflow)', type: 'Required', color: 'red' },
  { name: 'Startup Command', value: 'npm run start', type: 'Required', color: 'red' },
  { name: 'Platform', value: 'Linux', type: 'Required', color: 'red' },
  { name: 'Always On', value: 'ON  — prevents sleep and WebSocket disconnections', type: 'Required', color: 'red' },
  { name: 'WebSockets', value: 'ON  — required for real-time driver tracking and in-ride chat', type: 'Required', color: 'red' },
  { name: 'ARR Affinity', value: 'ON  — keeps sessions on the same instance (single instance)', type: 'Recommended', color: 'amber' },
  { name: 'HTTPS Only', value: 'ON  — required for secure cookies to work', type: 'Required', color: 'red' },
  { name: 'Minimum TLS Version', value: '1.2', type: 'Required', color: 'red' },
], true);

note('The startup command "npm run start" runs: NODE_ENV=production node dist/index.cjs — the pre-compiled server bundle built by GitHub Actions.', BRAND);

sectionBanner('🗄️', '2. PostgreSQL Database', 'Azure Database for PostgreSQL — Flexible Server (recommended)');

subHead('2a. Create the Database Server');
body('In Azure Portal → Create a resource → Azure Database for PostgreSQL Flexible Server');
doc.moveDown(0.3);
configTable([
  { name: 'Server type', value: 'Flexible Server (recommended over Single Server)', type: 'Required', color: 'red' },
  { name: 'PostgreSQL version', value: '16 (or 15 — both work)', type: 'Required', color: 'red' },
  { name: 'Compute tier', value: 'Burstable B1ms (1 vCore, 2 GB) is enough to start', type: 'Recommended', color: 'amber' },
  { name: 'Admin username', value: 'Choose a username (e.g. atlasride_admin)', type: 'Required', color: 'red' },
  { name: 'Admin password', value: 'Strong password — 8+ chars, upper, lower, number, symbol', type: 'Required', color: 'red' },
  { name: 'Allow Azure services', value: 'YES — needed so the App Service can connect', type: 'Required', color: 'red' },
  { name: 'SSL enforcement', value: 'Enabled (default)', type: 'Required', color: 'red' },
], true);

subHead('2b. Connection String Format');
codeBlock([
  'postgresql://USERNAME:PASSWORD@SERVER.postgres.database.azure.com/DATABASE_NAME?sslmode=require',
  '',
  '# Example:',
  'postgresql://atlasride_admin:MyPass123!@atlasride-db.postgres.database.azure.com/atlasride?sslmode=require',
], 'DATABASE_URL format — paste this into Azure App Settings');

note('The ?sslmode=require suffix is mandatory. Without it Azure PostgreSQL refuses the connection.', RED);

subHead('2c. Run Schema Migration (one-time setup)');
body('Run this once from your local machine after the Azure database is created. Point DATABASE_URL at your Azure database temporarily:');
codeBlock([
  'DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npm run db:push',
], 'Terminal — run from project root');
body('This creates all tables including the sessions table which is required for logins to work.', 0);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — All Environment Variables
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Environment Variables — Complete Reference');

sectionBanner('🔑', '3. Environment Variables — Complete Reference', 'Azure Portal → App Service → Configuration → Application Settings  → + New application setting');

note('Set ALL of these in Azure App Settings. Do NOT set them in .env files — those are for local development only. Variables marked AUTO are set by Azure automatically; never override them.', AMBER);

configTable([
  // Core
  { name: 'NODE_ENV',                     value: 'production',                                    type: 'REQUIRED', color: 'red' },
  { name: 'DATABASE_URL',                 value: 'postgresql://user:pass@host/db?sslmode=require', type: 'REQUIRED', color: 'red' },
  { name: 'SESSION_SECRET',               value: 'Random 40+ character string — generate with: openssl rand -base64 40', type: 'REQUIRED', color: 'red' },
  // Azure Maps
  { name: 'AZURE_MAPS_KEY',              value: 'Your Azure Maps subscription key (see section 4)', type: 'REQUIRED', color: 'red' },
  // Stripe
  { name: 'STRIPE_SECRET_KEY',            value: 'sk_live_... or sk_test_...  (from Stripe Dashboard)', type: 'REQUIRED', color: 'red' },
  { name: 'STRIPE_PUBLISHABLE_KEY',       value: 'pk_live_... or pk_test_...  (from Stripe Dashboard)', type: 'REQUIRED', color: 'red' },
  // Twilio
  { name: 'TWILIO_ACCOUNT_SID',           value: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  (from Twilio Console)', type: 'REQUIRED', color: 'red' },
  { name: 'TWILIO_AUTH_TOKEN',            value: 'Your Twilio Auth Token (from Twilio Console)', type: 'REQUIRED', color: 'red' },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', value: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  (from Twilio Console)', type: 'REQUIRED', color: 'red' },
  // Entra
  { name: 'ENTRA_CLIENT_ID',              value: 'Application (client) ID from Azure Entra app registration (see section 7)', type: 'REQUIRED', color: 'red' },
  { name: 'ENTRA_CLIENT_SECRET',          value: 'Client secret value from Azure Entra app registration (see section 7)', type: 'REQUIRED', color: 'red' },
  // Optional
  { name: 'MAPBOX_ACCESS_TOKEN',          value: 'pk.eyJ1... — Mapbox public token (optional, see section 8)', type: 'Optional', color: 'amber' },
  // Auto-set
  { name: 'PORT',                         value: '8080  — SET BY AZURE AUTOMATICALLY. Do not override.',   type: 'AUTO', color: 'green' },
  { name: 'WEBSITE_HOSTNAME',             value: 'saviaj.azurewebsites.net — SET BY AZURE AUTOMATICALLY.',  type: 'AUTO', color: 'green' },
], true);

subHead('Generate a SESSION_SECRET');
codeBlock([
  '# Option 1 — Mac / Linux terminal:',
  'openssl rand -base64 40',
  '',
  '# Option 2 — PowerShell (Windows):',
  '[Convert]::ToBase64String((1..40 | ForEach-Object { Get-Random -Maximum 256 }))',
  '',
  '# Option 3 — Node.js:',
  "node -e \"console.log(require('crypto').randomBytes(40).toString('base64'))\"",
], 'Run any one of these to produce a secure random secret');

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — Azure Maps + Stripe
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Azure Maps + Stripe Payments');

sectionBanner('🗺️', '4. Azure Maps', 'Geocoding, reverse geocoding, and route distance calculation', '#0369A1');

subHead('What AtlasRide uses Azure Maps for:');
configTable([
  { name: 'Forward geocoding', value: 'atlas.microsoft.com/search/address/json — converts typed address to lat/lng' },
  { name: 'Reverse geocoding', value: 'atlas.microsoft.com/search/address/reverse/json — converts lat/lng to readable address' },
  { name: 'Route directions', value: 'atlas.microsoft.com/route/directions/json — calculates driving distance between pickup and dropoff' },
], false);

subHead('4a. Create an Azure Maps Account');
stepBox('1', 'Azure Portal → Create a resource → search "Azure Maps"', [
  'Select Azure Maps → Create',
  'Choose your subscription and resource group',
  'Name: e.g. atlasride-maps',
  'Pricing tier: Gen2 (S0 is fine for production — pay-per-use)',
]);
stepBox('2', 'Get your subscription key', [
  'Azure Portal → your Azure Maps account → Settings → Authentication',
  'Copy "Primary Key" — this is your AZURE_MAPS_KEY value',
  'Paste it into Azure App Settings as AZURE_MAPS_KEY',
]);

note('Azure Maps Gen2 pricing: geocoding is ~$0.50 per 1,000 requests. Route directions ~$0.50 per 1,000 requests. Very low cost at typical ride volumes.', GREEN);

subHead('4b. Known Values (already in the code — no action needed)');
configTable([
  { name: 'API base URL', value: 'https://atlas.microsoft.com' },
  { name: 'Auth method', value: 'Subscription key (via AZURE_MAPS_KEY header)' },
  { name: 'API version', value: '2022-08-01 (set automatically by SDK)' },
], false);

sectionBanner('💳', '5. Stripe Payments', 'Payment processing for ride bookings', '#7C3AED');

subHead('What AtlasRide uses Stripe for:');
body('Riders pay for booked rides via Stripe Checkout. Stripe webhooks notify the server when payment is confirmed, triggering ride status updates. Driver earnings are tracked and protected server-side.');
doc.moveDown(0.3);

subHead('5a. Get your Stripe API Keys');
stepBox('1', 'Log in to your Stripe Dashboard → Developers → API keys', [
  'Copy "Publishable key" (starts with pk_live_ or pk_test_)',
  'Copy "Secret key" (starts with sk_live_ or sk_test_)',
  'Add both to Azure App Settings (see section 3)',
]);
stepBox('2', 'Switch to Live Mode for production', [
  'In Stripe Dashboard, toggle from "Test mode" to "Live mode" (top-left toggle)',
  'The live keys start with pk_live_ and sk_live_',
  'Use test keys (pk_test_, sk_test_) during testing only',
]);

subHead('5b. Stripe Webhook (auto-configured)');
body('The webhook URL and secret are managed automatically by the app. After first deployment, verify in Stripe Dashboard:');
codeBlock([
  '# Webhook URL format (auto-built from WEBSITE_HOSTNAME):',
  'https://YOUR-DOMAIN.azurewebsites.net/api/stripe/webhook/{uuid}',
  '',
  '# Verify in Stripe Dashboard → Developers → Webhooks',
  '# Status should show as "Enabled" with events: * (all events)',
], 'Stripe Dashboard → Developers → Webhooks');

configTable([
  { name: 'Stripe API version', value: '2025-11-17.clover  (hardcoded in stripeClient.ts)' },
  { name: 'Webhook events',     value: '* (all events — managed automatically)' },
  { name: 'Webhook secret',     value: 'Auto-managed by stripe-replit-sync library — no manual action needed' },
], false);

note('Stripe is optional for the app to START. If STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are missing, the app still launches but payment routes return errors. Add them before taking your first real booking.', AMBER);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 5 — Twilio + Entra
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Twilio SMS + Microsoft Entra Email OTP');

sectionBanner('📱', '6. Twilio SMS', 'Phone number verification during user registration', '#0369A1');

subHead('What AtlasRide uses Twilio for:');
body('When a user registers or changes their phone number, a 6-digit OTP is sent via SMS to verify ownership. Twilio Messaging Services are used (not a direct phone number).');
doc.moveDown(0.3);

subHead('6a. Setup Steps');
stepBox('1', 'Create a Twilio account at twilio.com', [
  'Complete account verification',
  'From the Twilio Console Dashboard, copy:',
  '  • Account SID  (starts with AC...) → TWILIO_ACCOUNT_SID',
  '  • Auth Token → TWILIO_AUTH_TOKEN',
]);
stepBox('2', 'Create a Messaging Service', [
  'Twilio Console → Messaging → Services → Create Messaging Service',
  'Name: e.g. AtlasRide SMS',
  'Purpose: Notifications',
  'Add a phone number (buy one in Phone Numbers → Manage → Buy a number)',
  'After creating, copy the Messaging Service SID (starts with MG...) → TWILIO_MESSAGING_SERVICE_SID',
]);
stepBox('3', 'Enable geographic permissions', [
  'Twilio Console → Messaging → Settings → Geo permissions',
  'Enable the countries your users are in (UK, etc.)',
  'Without this, international SMS will fail silently',
]);

configTable([
  { name: 'TWILIO_ACCOUNT_SID',           value: 'Found in Twilio Console → Dashboard (top of page)' },
  { name: 'TWILIO_AUTH_TOKEN',            value: 'Found in Twilio Console → Dashboard → click to reveal' },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', value: 'Found in Twilio Console → Messaging → Services → your service → Properties' },
  { name: 'Phone number format',          value: 'E.164 international format enforced (e.g. +447911123456)' },
], false);

note('Twilio SMS is required for phone OTP during registration. If Twilio is not configured the app still starts, but phone verification will fail and users cannot complete registration.', AMBER);

sectionBanner('✉️', '7. Microsoft Entra External ID (Email OTP)', 'Email verification for signup and password reset — tenant: atlasridecustomers', '#7C3AED');

subHead('What AtlasRide uses Entra for:');
body('When a user registers or resets their password, a 6-digit OTP is sent to their email by Microsoft\'s own email delivery infrastructure. No email provider to configure separately.');
doc.moveDown(0.3);

subHead('7a. Your Tenant Details (already configured in the code)');
configTable([
  { name: 'Tenant name',        value: 'atlasridecustomers  (already hardcoded in entraEmailOtp.ts)' },
  { name: 'Tenant domain',      value: 'atlasridecustomers.onmicrosoft.com  (already set)' },
  { name: 'CIAM endpoint',      value: 'https://atlasridecustomers.ciamlogin.com  (already set)' },
  { name: 'Auth flow',          value: 'Native Authentication — Email OTP (no redirect, no popup)' },
], false);

subHead('7b. Get your Client ID and Secret');
stepBox('1', 'Sign in to portal.azure.com → Microsoft Entra ID', [
  'In the left menu: App registrations',
  'Find your app registration (or create a new one for AtlasRide)',
  'Copy the "Application (client) ID" → ENTRA_CLIENT_ID',
]);
stepBox('2', 'Create a client secret', [
  'In your app registration → Certificates & secrets → + New client secret',
  'Description: AtlasRide Azure Production',
  'Expiry: 24 months (set a calendar reminder to rotate it)',
  'After clicking Add, copy the "Value" immediately → ENTRA_CLIENT_SECRET',
  'IMPORTANT: The value is only shown once. Copy it now.',
]);
stepBox('3', 'Ensure Native Auth is enabled', [
  'In your app registration → Authentication → Advanced settings',
  'Enable "Allow public client flows" → Yes',
  'In the CIAM admin center, ensure "Enable Native Authentication" is ON for this tenant',
]);

note('ENTRA_CLIENT_SECRET expires. Set a calendar reminder before the expiry date to generate a new secret and update the Azure App Setting — otherwise email OTP will stop working silently.', RED);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 6 — Mapbox + GitHub Actions
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Mapbox + GitHub Actions Deployment');

sectionBanner('🗺️', '8. Mapbox (Optional)', 'Map tile rendering — currently handled by OpenStreetMap by default', '#15803D');

body('Mapbox is referenced in the codebase but is currently optional. The map rendering uses OpenStreetMap tiles by default (free, no key needed). If you switch to Mapbox tiles for a premium look, you need this token.');
doc.moveDown(0.3);
stepBox('1', 'Create a Mapbox account at mapbox.com', [
  'Go to Account → Access tokens',
  'Copy the default public token (starts with pk.eyJ1...)',
  'Add to Azure App Settings as MAPBOX_ACCESS_TOKEN',
]);
note('You do NOT need Mapbox to run AtlasRide. The app works fully with OpenStreetMap tiles. Add this only if you decide to switch to Mapbox for map rendering.', GREEN);

sectionBanner('🚀', '9. GitHub Actions Deployment Workflow', 'Your workflow file: .github/workflows/main_saviaj.yml — already in the repo', '#0369A1');

subHead('How deployment works:');
body('Every push to the main branch triggers the workflow automatically. It:');
doc.moveDown(0.2);
configTable([
  { name: 'Step 1', value: 'Checks out code from GitHub' },
  { name: 'Step 2', value: 'Installs Node 24, runs npm install (all dependencies)' },
  { name: 'Step 3', value: 'Runs npm run build → produces dist/index.cjs + dist/public/' },
  { name: 'Step 4', value: 'Uploads the full directory (with dist/ included) as artifact' },
  { name: 'Step 5', value: 'Logs into Azure using OIDC (no publish profile needed)' },
  { name: 'Step 6', value: 'Deploys the artifact to Azure App Service "Saviaj", Production slot' },
], false);

subHead('GitHub Secrets already wired (set by Azure Deployment Center):');
configTable([
  { name: 'AZUREAPPSERVICE_CLIENTID_720A3FC2...', value: 'Azure service principal client ID — already set in GitHub repo secrets' },
  { name: 'AZUREAPPSERVICE_TENANTID_171C2A6F...', value: 'Azure tenant ID — already set in GitHub repo secrets' },
  { name: 'AZUREAPPSERVICE_SUBSCRIPTIONID_7A9...', value: 'Azure subscription ID — already set in GitHub repo secrets' },
], false);

note('These secrets were added automatically when you connected your GitHub repo via Azure Deployment Center. No manual action needed for deployment auth.', GREEN);

subHead('To deploy a new version:');
codeBlock([
  '# 1. Commit your changes',
  'git add -A',
  'git commit -m "your message"',
  '',
  '# 2. Push to main — this triggers the GitHub Actions workflow automatically',
  'git push',
  '',
  '# 3. Monitor deployment',
  '# GitHub → your repo → Actions tab → watch the workflow run (~3-5 minutes)',
], 'Terminal — run from project root');

subHead('Check deployment status:');
body('GitHub → your repository → Actions tab. A green tick means the deployment succeeded. A red cross means something failed — click the run to see which step failed and the error message.');

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 7 — Go-Live Checklist
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
header('Go-Live Checklist');

sectionBanner('✅', '10. Go-Live Checklist', 'Tick everything before opening AtlasRide to real users');

subHead('Azure App Service Configuration');
checkGrid([
  { label: 'Runtime: Node.js 24 LTS',              sub: 'Configuration → General Settings → Stack' },
  { label: 'Startup: npm run start',               sub: 'Configuration → General Settings → Startup Command' },
  { label: 'HTTPS Only: ON',                       sub: 'Configuration → General Settings' },
  { label: 'Always On: ON',                        sub: 'Configuration → General Settings' },
  { label: 'WebSockets: ON',                       sub: 'Configuration → General Settings' },
  { label: 'ARR Affinity: ON',                     sub: 'Configuration → General Settings' },
]);

subHead('Environment Variables (Azure App Settings)');
checkGrid([
  { label: 'NODE_ENV = production',                sub: 'Application Settings' },
  { label: 'DATABASE_URL set with ?sslmode=require', sub: 'Application Settings' },
  { label: 'SESSION_SECRET = 40+ random chars',   sub: 'Application Settings' },
  { label: 'AZURE_MAPS_KEY set',                  sub: 'Application Settings' },
  { label: 'STRIPE_SECRET_KEY set',               sub: 'Application Settings' },
  { label: 'STRIPE_PUBLISHABLE_KEY set',          sub: 'Application Settings' },
  { label: 'TWILIO_ACCOUNT_SID set',              sub: 'Application Settings' },
  { label: 'TWILIO_AUTH_TOKEN set',               sub: 'Application Settings' },
  { label: 'TWILIO_MESSAGING_SERVICE_SID set',    sub: 'Application Settings' },
  { label: 'ENTRA_CLIENT_ID set',                 sub: 'Application Settings' },
  { label: 'ENTRA_CLIENT_SECRET set',             sub: 'Application Settings' },
]);

subHead('Database');
checkGrid([
  { label: 'Azure PostgreSQL server created',      sub: 'Flexible Server, SSL enabled' },
  { label: 'Database created (e.g. atlasride)',    sub: 'Azure Portal → your server → Databases' },
  { label: '"Allow Azure services" is ON',         sub: 'Networking → Firewall rules' },
  { label: 'npm run db:push run against Azure DB', sub: 'Creates all tables incl. sessions' },
]);

subHead('Stripe');
checkGrid([
  { label: 'Live mode keys set (pk_live_, sk_live_)', sub: 'Not test keys for production' },
  { label: 'Webhook visible in Stripe Dashboard',  sub: 'Developers → Webhooks → status: Enabled' },
  { label: 'Test payment completed successfully',  sub: 'Use Stripe test card 4242 4242 4242 4242' },
]);

subHead('Twilio');
checkGrid([
  { label: 'Messaging Service created',            sub: 'With at least one phone number attached' },
  { label: 'Geo permissions enabled for UK/target countries', sub: 'Messaging → Settings → Geo permissions' },
  { label: 'Test SMS received on a real phone',    sub: 'Register a test account, verify number' },
]);

subHead('Entra External ID');
checkGrid([
  { label: 'App registration found/created',       sub: 'portal.azure.com → Entra ID → App registrations' },
  { label: 'ENTRA_CLIENT_ID copied',               sub: 'Application (client) ID' },
  { label: 'Client secret created and copied',     sub: 'ENTRA_CLIENT_SECRET — copy immediately after creation' },
  { label: 'Native Authentication enabled',        sub: 'Allow public client flows: Yes' },
  { label: 'Secret expiry noted in calendar',      sub: 'Rotate before it expires or email OTP breaks' },
]);

subHead('Post-Deployment Verification');
checkGrid([
  { label: 'Home page loads at your .azurewebsites.net URL', sub: 'Should show AtlasRide login screen' },
  { label: '/api/auth/user returns 401',           sub: 'Confirms API is live (normal before login)' },
  { label: 'Register a new account',               sub: 'Tests DB, Entra email OTP, and sessions' },
  { label: 'Verify phone number via SMS',          sub: 'Tests Twilio integration end-to-end' },
  { label: 'Post a ride request',                  sub: 'Tests Azure Maps geocoding' },
  { label: 'Complete a test payment',              sub: 'Tests Stripe end-to-end (use test card)' },
  { label: 'Log stream shows no ERROR lines',      sub: 'Azure Portal → App Service → Log stream' },
]);

doc.moveDown(0.5);
note('After passing all checks above, your AtlasRide instance is ready for real users. Keep this document updated whenever you rotate secrets or add new services.', BRAND);

// ── Footer + end ─────────────────────────────────────────────────────────────
footer();
doc.end();
doc.on('end', () => console.log('PDF generated:', outputPath));
