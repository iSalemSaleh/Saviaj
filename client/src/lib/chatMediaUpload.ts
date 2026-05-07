/**
 * Chat media upload helper.
 *
 * Two-step flow:
 *  1. Ask our server for a short-lived SAS PUT URL for this (rideId, mimeType).
 *  2. PUT the bytes directly to Azure Blob — never round-tripping our Node server.
 *
 * Returns the persisted (read) URL the chat should reference, plus echo'd metadata.
 * Throws on any non-2xx along the way so callers can surface an error toast.
 */

export interface UploadResult {
  readUrl: string;
  blobPath: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
}

export async function uploadChatMedia(opts: {
  rideId: number;
  blob: Blob;
  fileName?: string;
  durationMs?: number;
  onProgress?: (pct: number) => void;
}): Promise<UploadResult> {
  const { rideId, blob, fileName, durationMs, onProgress } = opts;
  const mimeType = blob.type || 'application/octet-stream';

  const sasRes = await fetch('/api/uploads/chat-media-sas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ rideId, mimeType, fileName }),
  });
  if (!sasRes.ok) {
    const j = await sasRes.json().catch(() => ({}));
    throw new Error(j.message || `SAS mint failed (${sasRes.status})`);
  }
  const sas = await sasRes.json() as {
    uploadUrl: string;
    readUrl: string;
    blobPath: string;
    mimeType: string;
    maxBytes: number;
  };

  if (blob.size > sas.maxBytes) {
    throw new Error(`File too large (${(blob.size / 1024 / 1024).toFixed(1)} MB > ${sas.maxBytes / 1024 / 1024} MB)`);
  }

  // Use XHR for progress reporting (fetch has no native upload progress in browsers).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sas.uploadUrl, true);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });

  return {
    readUrl: sas.readUrl,
    blobPath: sas.blobPath,
    mimeType,
    sizeBytes: blob.size,
    durationMs,
  };
}
