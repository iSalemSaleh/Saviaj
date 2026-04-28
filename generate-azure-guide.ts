import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const BRAND = '#0E7490'; // peacock blue
const DARK = '#1E293B';
const MID = '#475569';
const LIGHT = '#94A3B8';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREEN = '#16A34A';
const BG_LIGHT = '#F0F9FF';

const outputPath = path.join(process.cwd(), 'public', 'AtlasRide_Azure_Deployment_Guide.pdf');

const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
doc.pipe(fs.createWriteStream(outputPath));

// ── helpers ─────────────────────────────────────────────────────────────────
const W = doc.page.width - 100; // usable width

function header() {
  doc.rect(0, 0, doc.page.width, 60).fill(BRAND);
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
    .text('AtlasRide', 50, 18);
  doc.fillColor('white').fontSize(10).font('Helvetica')
    .text('Azure App Services Deployment Guide', 50, 40);
  doc.fillColor(DARK).moveDown(0);
  doc.y = 80;
}

function footer() {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    doc.fontSize(8).fillColor(LIGHT).font('Helvetica')
      .text(
        `AtlasRide — Confidential  ·  Page ${i + 1} of ${pages.count}  ·  Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        50, doc.page.height - 40, { width: W, align: 'center' }
      );
  }
}

function sectionTitle(title: string) {
  doc.moveDown(0.8);
  doc.rect(50, doc.y, W, 24).fill(BRAND);
  doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
    .text(title, 58, doc.y - 18);
  doc.fillColor(DARK).moveDown(0.6);
}

function subTitle(title: string) {
  doc.moveDown(0.5);
  doc.fillColor(BRAND).fontSize(10).font('Helvetica-Bold').text(title);
  doc.fillColor(DARK).font('Helvetica').fontSize(9);
}

function body(text: string) {
  doc.fillColor(DARK).fontSize(9).font('Helvetica').text(text, { width: W });
}

function bullet(items: { label: string; value?: string; color?: string }[]) {
  for (const item of items) {
    const bY = doc.y;
    doc.rect(50, bY + 3, 4, 4).fill(item.color || BRAND);
    doc.fillColor(item.color || DARK).fontSize(9).font(item.value ? 'Helvetica-Bold' : 'Helvetica')
      .text(item.label + (item.value ? '' : ''), 62, bY, { continued: !!item.value, width: W - 12 });
    if (item.value) {
      doc.font('Helvetica').fillColor(MID).text('  ' + item.value, { width: W - 80 });
    }
    doc.moveDown(0.15);
  }
}

function envTable(rows: { name: string; value: string; required: boolean }[]) {
  const colW = [200, 240, 60];
  const rowH = 18;
  let x = 50;
  let y = doc.y + 6;

  // header row
  doc.rect(x, y, W, rowH).fill(BRAND);
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  doc.text('Variable Name', x + 6, y + 5, { width: colW[0] });
  doc.text('Value / Description', x + colW[0] + 6, y + 5, { width: colW[1] });
  doc.text('Required', x + colW[0] + colW[1] + 6, y + 5, { width: colW[2] });
  y += rowH;

  rows.forEach((row, i) => {
    doc.rect(x, y, W, rowH).fill(i % 2 === 0 ? BG_LIGHT : 'white');
    doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold')
      .text(row.name, x + 6, y + 5, { width: colW[0] });
    doc.font('Helvetica').fillColor(MID)
      .text(row.value, x + colW[0] + 6, y + 5, { width: colW[1] });
    const reqColor = row.required ? RED : AMBER;
    doc.fillColor(reqColor).font('Helvetica-Bold')
      .text(row.required ? 'YES' : 'Optional', x + colW[0] + colW[1] + 6, y + 5, { width: colW[2] });
    y += rowH;
  });
  doc.y = y + 8;
}

function riskTable(rows: { severity: string; title: string; detail: string; fix: string }[]) {
  const colW = [55, 130, 160, 155];
  const rowH = 32;
  let x = 50;
  let y = doc.y + 6;

  doc.rect(x, y, W, 18).fill(BRAND);
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  doc.text('Severity', x + 4, y + 5, { width: colW[0] });
  doc.text('Issue', x + colW[0] + 4, y + 5, { width: colW[1] });
  doc.text('Detail', x + colW[0] + colW[1] + 4, y + 5, { width: colW[2] });
  doc.text('Resolution', x + colW[0] + colW[1] + colW[2] + 4, y + 5, { width: colW[3] });
  y += 18;

  rows.forEach((row, i) => {
    const rowColor = i % 2 === 0 ? BG_LIGHT : 'white';
    doc.rect(x, y, W, rowH).fill(rowColor);

    const sevColor = row.severity === 'CRITICAL' ? RED : row.severity === 'MEDIUM' ? AMBER : GREEN;
    doc.rect(x, y, colW[0], rowH).fill(sevColor);
    doc.fillColor('white').fontSize(7).font('Helvetica-Bold')
      .text(row.severity, x + 4, y + (rowH / 2) - 4, { width: colW[0] - 8 });

    doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold')
      .text(row.title, x + colW[0] + 4, y + 4, { width: colW[1] - 8 });
    doc.font('Helvetica').fillColor(MID)
      .text(row.detail, x + colW[0] + colW[1] + 4, y + 4, { width: colW[2] - 8 });
    doc.fillColor(GREEN).font('Helvetica')
      .text(row.fix, x + colW[0] + colW[1] + colW[2] + 4, y + 4, { width: colW[3] - 8 });
    y += rowH;
  });
  doc.y = y + 8;
}

function infoBox(text: string, color = BRAND) {
  const bY = doc.y + 4;
  const textH = doc.heightOfString(text, { width: W - 24 });
  doc.rect(50, bY, W, textH + 14).fill(color + '18');
  doc.rect(50, bY, 3, textH + 14).fill(color);
  doc.fillColor(color).fontSize(8.5).font('Helvetica-Bold')
    .text(text, 62, bY + 7, { width: W - 24 });
  doc.fillColor(DARK).moveDown(0.6);
  doc.y = bY + textH + 20;
}

// ── PAGE 1 — Title + Overview ────────────────────────────────────────────────
header();

doc.fillColor(BRAND).fontSize(22).font('Helvetica-Bold')
  .text('Azure App Services', 50, doc.y, { width: W });
doc.fillColor(DARK).fontSize(22).font('Helvetica')
  .text('Deployment Guide', { width: W });
doc.moveDown(0.4);
doc.fillColor(MID).fontSize(10).font('Helvetica')
  .text('Complete setup, environment configuration, and runtime risk register for AtlasRide on Azure', { width: W });
doc.moveDown(0.3);
doc.fillColor(LIGHT).fontSize(8)
  .text(`Prepared by AtlasRide Engineering  ·  ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, { width: W });

doc.moveDown(1);
doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor(BRAND).lineWidth(1).stroke();
doc.moveDown(0.8);

sectionTitle('1. Architecture Overview');

body('AtlasRide is a full-stack Node.js / React application. The server is a compiled CommonJS bundle (dist/index.cjs) that serves both the REST API and the pre-built React frontend. In production it connects to a PostgreSQL database and communicates with Stripe, Twilio, Azure Maps, and Microsoft Entra External ID.');
doc.moveDown(0.5);

bullet([
  { label: 'Runtime:', value: 'Node.js 20 (LTS)' },
  { label: 'Start command:', value: 'npm run start  →  node dist/index.cjs' },
  { label: 'Port:', value: 'Reads process.env.PORT (Azure sets this automatically)' },
  { label: 'Database:', value: 'PostgreSQL — Azure Database for PostgreSQL Flexible Server recommended' },
  { label: 'Session store:', value: 'PostgreSQL-backed via connect-pg-simple' },
  { label: 'File uploads:', value: 'Local disk  (see Risk #4 below for Azure caveat)' },
]);

sectionTitle('2. Pre-Deployment Checklist');

subTitle('Step 1 — Create Azure Resources');
bullet([
  { label: 'Azure App Service Plan (Linux, Node 20 LTS)' },
  { label: 'Azure App Service (Web App)' },
  { label: 'Azure Database for PostgreSQL Flexible Server' },
  { label: 'Optional: Azure Blob Storage (for persistent file uploads)' },
]);

subTitle('Step 2 — Build the Application');
body('Run the following from the project root before deploying:');
doc.moveDown(0.3);
doc.rect(50, doc.y, W, 28).fill('#1E293B');
doc.fillColor('#34D399').fontSize(8.5).font('Helvetica')
  .text('npm run build', 62, doc.y - 22);
doc.fillColor(DARK).moveDown(0.8);
body('This produces dist/index.cjs and dist/public/. Both must be deployed to Azure.');

subTitle('Step 3 — Deploy Code to Azure');
bullet([
  { label: 'Via GitHub Actions: connect your repo in Azure Deployment Center' },
  { label: 'Via ZIP Deploy: zip the project (including dist/) and upload via Kudu' },
  { label: 'Via Azure CLI: az webapp deploy --src-path ./dist' },
]);

// ── PAGE 2 — Environment Variables ──────────────────────────────────────────
doc.addPage();
header();

sectionTitle('3. Required Environment Variables');
body('Set all of these in Azure Portal → App Service → Configuration → Application Settings. Without these the application will crash on startup.');
doc.moveDown(0.4);

envTable([
  { name: 'NODE_ENV', value: 'production', required: true },
  { name: 'DATABASE_URL', value: 'postgresql://user:password@host/dbname?sslmode=require', required: true },
  { name: 'SESSION_SECRET', value: 'Any 32+ character random string (use a password generator)', required: true },
  { name: 'AZURE_MAPS_KEY', value: 'Your Azure Maps subscription key', required: true },
  { name: 'TWILIO_ACCOUNT_SID', value: 'Your Twilio Account SID (ACxxxxxxxxxxxxxxxx)', required: true },
  { name: 'TWILIO_AUTH_TOKEN', value: 'Your Twilio Auth Token', required: true },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', value: 'Your Twilio Messaging Service SID', required: true },
  { name: 'ENTRA_CLIENT_SECRET', value: 'Microsoft Entra External ID client secret (for email OTP)', required: true },
  { name: 'MAPBOX_ACCESS_TOKEN', value: 'Your Mapbox public access token', required: false },
  { name: 'WEBSITE_HOSTNAME', value: 'Auto-set by Azure — do not override', required: false },
]);

infoBox('IMPORTANT: DATABASE_URL must end with ?sslmode=require when connecting to Azure Database for PostgreSQL. Without this the connection will be refused by Azure.', RED);

sectionTitle('4. Database Setup on Azure');

subTitle('4a. Create the Schema');
body('After provisioning your Azure PostgreSQL server and creating a database, you must run the schema migration from your local environment (or CI pipeline) pointing at the Azure database:');
doc.moveDown(0.3);
doc.rect(50, doc.y, W, 42).fill('#1E293B');
doc.fillColor('#34D399').fontSize(8).font('Helvetica')
  .text('# Set DATABASE_URL to your Azure PostgreSQL connection string, then:', 62, doc.y - 36)
  .text('DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npm run db:push', 62, doc.y - 22);
doc.fillColor(DARK).moveDown(1.2);

subTitle('4b. Sessions Table');
body('The app connects to a sessions table for user session storage. The db:push command above will create it automatically from the schema. If you see "relation sessions does not exist" errors, re-run db:push.');

subTitle('4c. Connection String Format');
doc.rect(50, doc.y + 4, W, 28).fill('#1E293B');
doc.fillColor('#93C5FD').fontSize(8).font('Helvetica')
  .text('postgresql://USERNAME:PASSWORD@SERVER_NAME.postgres.database.azure.com/DATABASE_NAME?sslmode=require', 62, doc.y - 20, { width: W - 24 });
doc.fillColor(DARK).moveDown(1);

// ── PAGE 3 — Runtime Risk Register ──────────────────────────────────────────
doc.addPage();
header();

sectionTitle('5. Runtime Risk Register');
body('The following issues were identified by a code audit. All critical items must be resolved before go-live.');
doc.moveDown(0.4);

riskTable([
  {
    severity: 'CRITICAL',
    title: 'Missing SESSION_SECRET',
    detail: 'The app uses session.secret with a non-null assertion (!). If SESSION_SECRET is not set in Azure App Settings the server crashes on startup.',
    fix: 'Set SESSION_SECRET in Azure App Settings. Use a 40+ character random string.'
  },
  {
    severity: 'CRITICAL',
    title: 'Missing DATABASE_URL',
    detail: 'Without DATABASE_URL the PostgreSQL pool fails to initialise. The server will start but every DB query crashes with an unhelpful error.',
    fix: 'Set DATABASE_URL pointing to your Azure PostgreSQL server with ?sslmode=require.'
  },
  {
    severity: 'CRITICAL',
    title: 'Sessions table absent',
    detail: 'connect-pg-simple is configured with createTableIfMissing: false. If the sessions table does not exist in the database the app will throw on every login attempt.',
    fix: 'Run npm run db:push against the Azure DB before first deployment.'
  },
  {
    severity: 'MEDIUM',
    title: 'Replit OIDC on Azure',
    detail: 'The /api/login route uses Replit OAuth (openid-client). REPL_ID and ISSUER_URL are Replit-specific. This route will fail silently on Azure.',
    fix: 'Users should log in via email/password (/api/auth/login). Replit OAuth is not required and can be ignored on Azure.'
  },
  {
    severity: 'MEDIUM',
    title: 'File uploads — ephemeral disk',
    detail: 'Driver licence photos and profile images are written to the local filesystem (uploads/). Azure App Service restarts wipe the local disk, permanently deleting files.',
    fix: 'Long-term: migrate file storage to Azure Blob Storage. Short-term: uploads persist across warm restarts but not deployments.'
  },
  {
    severity: 'MEDIUM',
    title: 'Stripe webhook URL',
    detail: 'The webhook URL is auto-built from WEBSITE_HOSTNAME (set by Azure). This is correct but must be verified in your Stripe dashboard after first deployment.',
    fix: 'Check Stripe Dashboard → Webhooks after first deployment to confirm the URL matches your Azure domain.'
  },
  {
    severity: 'LOW',
    title: 'reusePort flag',
    detail: 'Server was configured with reusePort: true which is Linux-only and unsupported on some Azure configurations.',
    fix: 'FIXED — reusePort is now disabled automatically when running on Azure (detected via WEBSITE_HOSTNAME).'
  },
  {
    severity: 'LOW',
    title: 'Vite HMR WebSocket',
    detail: 'Browser console shows WebSocket HMR errors in development. Not present in production.',
    fix: 'No action needed — this only appears in the Replit development preview, not in production.'
  },
]);

// ── PAGE 4 — Startup Command + Checklist ────────────────────────────────────
doc.addPage();
header();

sectionTitle('6. Azure App Service Configuration');

subTitle('Startup Command');
body('In Azure Portal → App Service → Configuration → General Settings, set:');
doc.rect(50, doc.y + 4, W, 24).fill('#1E293B');
doc.fillColor('#34D399').fontSize(9).font('Helvetica-Bold')
  .text('npm run start', 62, doc.y - 16);
doc.fillColor(DARK).moveDown(0.8);

subTitle('Node.js Version');
body('Set to Node 20 LTS in Azure Portal → App Service → Configuration → General Settings → Stack: Node, Version: 20 LTS.');

subTitle('Always On');
body('Enable "Always On" in App Service Configuration → General Settings to prevent the app sleeping and losing WebSocket connections.');

subTitle('WebSocket Support');
body('Enable WebSockets in App Service Configuration → General Settings. AtlasRide uses WebSockets for real-time driver tracking and in-ride chat.');

sectionTitle('7. Post-Deployment Verification');

subTitle('Health Checks');
bullet([
  { label: 'Visit https://YOUR-APP.azurewebsites.net/ — should show the AtlasRide login screen' },
  { label: 'Visit https://YOUR-APP.azurewebsites.net/api/auth/user — should return 401 (confirms API is live)' },
  { label: 'Create an account and log in — confirms database connection and session store are working' },
  { label: 'Upload a profile photo — confirms file upload route is working' },
  { label: 'Check Stripe Dashboard → Webhooks — confirm webhook URL matches your domain' },
]);

subTitle('Logs');
body('View real-time logs in Azure Portal → App Service → Log Stream, or use Azure CLI:');
doc.rect(50, doc.y + 4, W, 24).fill('#1E293B');
doc.fillColor('#34D399').fontSize(8.5).font('Helvetica')
  .text('az webapp log tail --name YOUR-APP --resource-group YOUR-RG', 62, doc.y - 16);
doc.fillColor(DARK).moveDown(0.8);

sectionTitle('8. Environment Variable Quick-Reference Card');
body('Print and keep this card during setup. Tick each item as it is configured.');
doc.moveDown(0.4);

const checkItems = [
  'NODE_ENV = production',
  'DATABASE_URL = postgresql://...?sslmode=require',
  'SESSION_SECRET = (40+ random chars)',
  'AZURE_MAPS_KEY = (Azure Maps key)',
  'TWILIO_ACCOUNT_SID = ACxxx...',
  'TWILIO_AUTH_TOKEN = (auth token)',
  'TWILIO_MESSAGING_SERVICE_SID = MGxxx...',
  'ENTRA_CLIENT_SECRET = (client secret)',
  'MAPBOX_ACCESS_TOKEN = pk.xxx... (optional)',
  'db:push run against Azure PostgreSQL',
  'Startup command set to: npm run start',
  'Node version set to 20 LTS',
  'Always On: ENABLED',
  'WebSockets: ENABLED',
  'Stripe webhook URL verified in dashboard',
];

let cY = doc.y;
checkItems.forEach((item, i) => {
  if (i % 2 === 0) {
    doc.rect(50, cY, W / 2 - 4, 20).fill(i % 4 === 0 ? BG_LIGHT : 'white').stroke('#E2E8F0');
    doc.rect(53, cY + 6, 8, 8).stroke(BRAND);
    doc.fillColor(DARK).fontSize(8).font('Helvetica')
      .text(item, 66, cY + 6, { width: W / 2 - 24 });
  } else {
    doc.rect(50 + W / 2 + 4, cY, W / 2 - 4, 20).fill(i % 4 === 1 ? BG_LIGHT : 'white').stroke('#E2E8F0');
    doc.rect(53 + W / 2 + 4, cY + 6, 8, 8).stroke(BRAND);
    doc.fillColor(DARK).fontSize(8).font('Helvetica')
      .text(item, 66 + W / 2 + 4, cY + 6, { width: W / 2 - 24 });
    cY += 22;
  }
});

doc.moveDown(2);
infoBox('Questions or issues? All deployment decisions described in this document are based on an audit of the AtlasRide codebase as of the date shown on the cover. Re-run the audit after major code changes.', BRAND);

footer();
doc.end();

doc.on('end', () => {
  console.log('PDF generated:', outputPath);
});
