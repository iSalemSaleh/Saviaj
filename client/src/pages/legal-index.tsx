import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, Shield, RefreshCcw, Ban } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRideLogo_1767134626458.png";
import { SAVIAJ_COMPANY_INFO, formatRegisteredAddress } from "@shared/data/company-info";

const LEGAL_DOCS = [
  {
    slug: "terms",
    title: "Terms of Service",
    description: "The agreement between you and Saviaj when you use the platform.",
    icon: FileText,
    aliases: ["/terms", "/terms-of-service", "/terms_of_service"],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    description: "How we collect, use, store and protect your personal data (ICO ZC129989).",
    icon: Shield,
    aliases: ["/privacy", "/privacy-policy", "/privacy_policy"],
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    description: "When and how refunds are issued for cancelled or disputed rides.",
    icon: RefreshCcw,
    aliases: ["/refund-policy", "/refund_policy"],
  },
  {
    slug: "cancellation-policy",
    title: "Cancellation Policy",
    description: "Cancellation rules, deadlines and fees for riders and drivers.",
    icon: Ban,
    aliases: ["/cancellation-policy", "/cancellation_policy"],
  },
] as const;

export default function LegalIndexPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Legal • Saviaj";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-4 flex items-center justify-between border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <button
          onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/"))}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-legal-index-back"
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
        <div className="w-full max-w-3xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-legal-index-title">
              Legal
            </h1>
            <p className="text-muted-foreground">
              All Saviaj legal documents in one place. Each one is also
              reachable via a short direct link.
            </p>
          </div>

          <div className="grid gap-4">
            {LEGAL_DOCS.map((doc) => {
              const Icon = doc.icon;
              return (
                <Link
                  key={doc.slug}
                  href={`/${doc.slug}`}
                  data-testid={`card-legal-${doc.slug}`}
                >
                  <Card className="hover-elevate active-elevate-2 transition-shadow cursor-pointer">
                    <CardContent className="p-5 flex gap-4 items-start">
                      <div className="rounded-lg bg-primary/10 p-3 text-primary shrink-0">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold">{doc.title}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {doc.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {doc.aliases.map((a) => (
                            <code
                              key={a}
                              className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground/80"
                            >
                              {a}
                            </code>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground pt-4 border-t space-y-1" data-testid="text-legal-company-info">
            <div>
              {SAVIAJ_COMPANY_INFO.legalName} · Company No. {SAVIAJ_COMPANY_INFO.companyNumber} ·
              ICO registration {SAVIAJ_COMPANY_INFO.ico.registrationNumber}
            </div>
            <div>{formatRegisteredAddress()}</div>
            <div>
              {SAVIAJ_COMPANY_INFO.phvOperatorLicence.licenceNumber ? (
                <>PHV Operator Licence: {SAVIAJ_COMPANY_INFO.phvOperatorLicence.licenceNumber}
                {" "}({SAVIAJ_COMPANY_INFO.phvOperatorLicence.issuingAuthority})</>
              ) : (
                <span>PHV Operator Licence: application pending</span>
              )}
              {" · "}
              {SAVIAJ_COMPANY_INFO.vat.vatNumber ? (
                <>VAT No. {SAVIAJ_COMPANY_INFO.vat.vatNumber}</>
              ) : (
                <span>VAT: not yet registered (below HMRC threshold)</span>
              )}
            </div>
            <div>
              Data Protection Officer:{" "}
              <a
                href={`mailto:${SAVIAJ_COMPANY_INFO.dpo.email}`}
                className="underline hover:text-foreground"
              >
                {SAVIAJ_COMPANY_INFO.dpo.email}
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sibranet Technologies Ltd. All rights reserved.
      </footer>
    </div>
  );
}
