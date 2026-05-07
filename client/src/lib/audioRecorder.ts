/**
 * Voice-note recorder for the chat.
 *
 * Wraps MediaRecorder with a browser-friendly mime-type fallback chain. The caller
 * starts/stops; we resolve with a Blob + duration. Permission failures bubble up so
 * the UI can show a "Microphone blocked" tooltip.
 */

const MIME_PRIORITY = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export interface VoiceRecording { blob: Blob; durationMs: number; mimeType: string; }

export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private mimeType = 'audio/webm';

  static pickMime(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    for (const m of MIME_PRIORITY) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
    }
    return 'audio/webm';
  }

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone not available in this browser');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = AudioRecorder.pickMime();
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start();
    this.startedAt = Date.now();
  }

  isRecording(): boolean { return this.recorder?.state === 'recording'; }

  /** Returns the recording — may be null if start() was never called or no data captured. */
  async stop(): Promise<VoiceRecording | null> {
    if (!this.recorder) return null;
    const rec = this.recorder;
    const stream = this.stream;
    // Release the microphone hardware immediately. If `onstop` never fires for any
    // browser-edge-case reason, the mic indicator should still go away.
    const releaseTracks = () => stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    return new Promise<VoiceRecording | null>((resolve) => {
      rec.onstop = () => {
        const durationMs = Date.now() - this.startedAt;
        const blob = new Blob(this.chunks, { type: this.mimeType });
        releaseTracks();
        this.recorder = null;
        this.stream = null;
        this.chunks = [];
        if (blob.size === 0) resolve(null);
        else resolve({ blob, durationMs, mimeType: this.mimeType });
      };
      try {
        rec.stop();
      } catch {
        releaseTracks();
        resolve(null);
      }
    });
  }

  cancel(): void {
    try { this.recorder?.stop(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
  }
}
