/**
 * Azure Blob Storage helper for chat media (images / voice notes / file attachments).
 *
 * The client never uploads through our server — that would double our bandwidth bill and
 * hurt latency on mobile. Instead we mint a short-lived **SAS PUT URL** scoped to a single
 * blob path and the client streams the bytes directly to Azure. We then trust that URL as
 * the canonical media reference once we get a `chat_message` with the resulting URL back.
 *
 * Required env (gracefully no-op when absent — `getStatus()` reports `ready: false`):
 *   - `AZURE_STORAGE_ACCOUNT`              account name (eg. "saviajchat")
 *   - `AZURE_STORAGE_KEY`                  primary or secondary access key
 *   - `AZURE_STORAGE_CONTAINER`            container name (default "chat-media", must exist
 *                                          and have `private` access; we serve via SAS GET)
 */

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";

const ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT;
const KEY = process.env.AZURE_STORAGE_KEY;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "chat-media";

// Allow-list of MIME types the chat surface knows how to render. Anything else is rejected
// at SAS-mint time so we never end up with eg. an `.exe` masquerading as a chat attachment.
const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per attachment.

let sharedKey: StorageSharedKeyCredential | null = null;
let serviceClient: BlobServiceClient | null = null;

function ensureClient(): { sharedKey: StorageSharedKeyCredential; serviceClient: BlobServiceClient } {
  if (!ACCOUNT || !KEY) {
    throw new Error("Azure Blob Storage not configured (AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY missing)");
  }
  if (!sharedKey) sharedKey = new StorageSharedKeyCredential(ACCOUNT, KEY);
  if (!serviceClient) {
    serviceClient = new BlobServiceClient(`https://${ACCOUNT}.blob.core.windows.net`, sharedKey);
  }
  return { sharedKey, serviceClient };
}

export interface SasUploadDescriptor {
  uploadUrl: string;     // PUT here from the browser/native client.
  readUrl: string;       // GET URL the chat persists as the canonical mediaUrl (also SAS-signed).
  blobPath: string;      // for our own auditing / cleanup jobs.
  expiresAt: string;     // ISO timestamp.
  mimeType: string;
  maxBytes: number;
}

/**
 * Mint a one-shot SAS for the given user + ride + extension.
 * Uploads expire in 10 minutes; reads expire in 14 days (long enough for the
 * receiver to scroll back; we re-mint on demand if needed).
 */
export function createUploadSas(opts: {
  userId: string;
  rideId: number;
  mimeType: string;
  fileName?: string;
}): SasUploadDescriptor {
  const { sharedKey, serviceClient } = ensureClient();

  if (!ALLOWED_MIME.has(opts.mimeType)) {
    throw new Error(`Unsupported media type: ${opts.mimeType}`);
  }

  const ext = (opts.fileName?.split(".").pop() || mimeToExt(opts.mimeType)).replace(/[^a-z0-9]/gi, "").slice(0, 10);
  const blobName = `ride-${opts.rideId}/${opts.userId}/${Date.now()}-${randomUUID()}.${ext}`;

  const containerClient = serviceClient.getContainerClient(CONTAINER);
  const blobClient = containerClient.getBlobClient(blobName);

  const now = new Date();
  const uploadExpiry = new Date(now.getTime() + 10 * 60 * 1000);     // 10 minutes
  const readExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const uploadSas = generateBlobSASQueryParameters({
    containerName: CONTAINER,
    blobName,
    permissions: BlobSASPermissions.parse("cw"), // create + write only
    startsOn: new Date(now.getTime() - 60 * 1000), // skew tolerance
    expiresOn: uploadExpiry,
    protocol: SASProtocol.Https,
    contentType: opts.mimeType,
  }, sharedKey).toString();

  const readSas = generateBlobSASQueryParameters({
    containerName: CONTAINER,
    blobName,
    permissions: BlobSASPermissions.parse("r"),
    startsOn: new Date(now.getTime() - 60 * 1000),
    expiresOn: readExpiry,
    protocol: SASProtocol.Https,
  }, sharedKey).toString();

  return {
    uploadUrl: `${blobClient.url}?${uploadSas}`,
    readUrl: `${blobClient.url}?${readSas}`,
    blobPath: blobName,
    expiresAt: uploadExpiry.toISOString(),
    mimeType: opts.mimeType,
    maxBytes: MAX_BYTES,
  };
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "audio/webm": return "webm";
    case "audio/mpeg": return "mp3";
    case "audio/mp4": return "m4a";
    case "audio/ogg": return "ogg";
    case "audio/wav": return "wav";
    case "application/pdf": return "pdf";
    default: return "bin";
  }
}

export function getStatus(): { ready: boolean; container: string; account?: string } {
  return {
    ready: !!(ACCOUNT && KEY),
    container: CONTAINER,
    account: ACCOUNT ? `${ACCOUNT.slice(0, 3)}***` : undefined,
  };
}
