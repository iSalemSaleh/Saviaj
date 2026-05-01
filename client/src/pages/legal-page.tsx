import { useEffect, useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRideLogo_1767134626458.png";

import termsMd from "@/legal/terms.md?raw";
import privacyMd from "@/legal/privacy.md?raw";
import refundMd from "@/legal/refund-policy.md?raw";
import cancellationMd from "@/legal/cancellation-policy.md?raw";

export type LegalDoc = "terms" | "privacy" | "refund-policy" | "cancellation-policy";

const DOCS: Record<LegalDoc, { title: string; body: string }> = {
  terms: { title: "Terms of Service", body: termsMd },
  privacy: { title: "Privacy Policy", body: privacyMd },
  "refund-policy": { title: "Refund Policy", body: refundMd },
  "cancellation-policy": { title: "Cancellation Policy", body: cancellationMd },
};

export default function LegalPage({ doc }: { doc?: LegalDoc }) {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ doc?: string }>("/legal/:doc");
  const slug = (doc ?? (params?.doc as LegalDoc | undefined)) as LegalDoc | undefined;

  const content = useMemo(() => (slug && DOCS[slug] ? DOCS[slug] : null), [slug]);

  useEffect(() => {
    if (content) {
      document.title = `${content.title} • Saviaj`;
      window.scrollTo(0, 0);
    }
  }, [content]);

  if (!content) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <h1 className="text-2xl font-bold">Document not found</h1>
            <p className="text-muted-foreground">We couldn't find that legal document.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-legal-home">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-4 flex items-center justify-between border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <button
          onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/"))}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-legal-back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </button>
        <Link href="/" className="flex items-center gap-2">
          <img src={atlasRideLogo} alt="Saviaj" className="h-8 w-8" />
          <span className="font-bold text-lg text-primary">Saviaj</span>
        </Link>
      </header>

      <main className="flex-1 flex justify-center p-4 md:p-8">
        <Card className="w-full max-w-3xl">
          <CardContent className="p-6 md:p-10">
            <article data-testid={`legal-content-${slug}`}>
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-3xl font-bold tracking-tight mb-2">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mt-8 mb-3 text-foreground">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold mt-6 mb-2 text-foreground">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="my-3 leading-relaxed text-foreground/90">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-3 ml-6 list-disc space-y-1 text-foreground/90">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-3 ml-6 list-decimal space-y-1 text-foreground/90">{children}</ol>
                  ),
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="text-primary underline underline-offset-4 hover:no-underline"
                      target={href?.startsWith("http") ? "_blank" : undefined}
                      rel={href?.startsWith("http") ? "noreferrer noopener" : undefined}
                    >
                      {children}
                    </a>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-muted-foreground">{children}</em>
                  ),
                  hr: () => <hr className="my-8 border-border" />,
                }}
              >
                {content.body}
              </ReactMarkdown>
            </article>

            <div className="mt-10 pt-6 border-t flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">See also:</span>
              {(Object.keys(DOCS) as LegalDoc[])
                .filter((k) => k !== slug)
                .map((k) => (
                  <Link
                    key={k}
                    href={`/${k}`}
                    className="text-primary hover:underline"
                    data-testid={`link-legal-${k}`}
                  >
                    {DOCS[k].title}
                  </Link>
                ))}
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="p-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sibranet Technologies Ltd. All rights reserved.
      </footer>
    </div>
  );
}
