/**
 * Azure AI Translator REST client. Single-call helper used by the chat to translate a
 * message into the recipient's preferred language on demand (Tier 5).
 *
 * Required env (no-op when absent):
 *   - `AZURE_TRANSLATOR_KEY`     resource subscription key
 *   - `AZURE_TRANSLATOR_REGION`  resource region (eg. "uksouth")
 *   - `AZURE_TRANSLATOR_ENDPOINT` (optional) override; defaults to the global endpoint.
 *
 * The translate endpoint can also auto-detect source language, so we always pass `from=null`
 * unless the caller knows it.
 */

const KEY = process.env.AZURE_TRANSLATOR_KEY;
const REGION = process.env.AZURE_TRANSLATOR_REGION;
const ENDPOINT = (process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com").replace(/\/$/, "");

export interface TranslationResult {
  translated: string;
  detectedLanguage?: string;
  detectedConfidence?: number;
  targetLanguage: string;
}

export async function translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult> {
  if (!KEY || !REGION) {
    throw new Error("Azure Translator not configured (AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION missing)");
  }
  if (!text.trim()) {
    return { translated: text, targetLanguage };
  }

  const params = new URLSearchParams({ "api-version": "3.0", to: targetLanguage });
  if (sourceLanguage) params.set("from", sourceLanguage);
  const url = `${ENDPOINT}/translate?${params.toString()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": KEY,
      "Ocp-Apim-Subscription-Region": REGION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ Text: text }]),
  });

  if (!res.ok) {
    throw new Error(`Translator HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as Array<{
    translations: Array<{ text: string; to: string }>;
    detectedLanguage?: { language: string; score: number };
  }>;

  const first = data[0];
  return {
    translated: first?.translations?.[0]?.text ?? text,
    detectedLanguage: first?.detectedLanguage?.language,
    detectedConfidence: first?.detectedLanguage?.score,
    targetLanguage,
  };
}

export function getStatus(): { ready: boolean; region?: string } {
  return { ready: !!(KEY && REGION), region: REGION };
}
