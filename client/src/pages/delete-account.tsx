import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm) {
      setError("Please confirm you want to delete your account.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account-deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), reason: reason.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to submit request");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-background">
      <Card className="w-full max-w-xl" data-testid="card-delete-account">
        <CardHeader>
          <CardTitle data-testid="text-page-title">Delete Your Saviaj Account</CardTitle>
          <CardDescription>
            We're sorry to see you go. Your request will be processed within 30 days as required by UK GDPR.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {submitted ? (
            <div className="space-y-4" data-testid="state-submitted">
              <div className="flex items-start gap-3 p-4 rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Request received.</p>
                  <p className="text-muted-foreground mt-1">
                    We'll verify your request and process it within 30 days. You'll receive an email confirmation
                    once your account and personal data are deleted.
                  </p>
                </div>
              </div>
              <Link
                href="/"
                className="inline-flex items-center text-sm underline"
                data-testid="link-home"
              >
                Return to home
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Already signed in?</strong> The fastest way to delete your account
                  is from inside the app: go to{" "}
                  <Link href="/settings" className="underline" data-testid="link-settings">Settings → Delete account</Link>.
                </p>
                <p>
                  <strong className="text-foreground">No app access?</strong> Submit the form below and our team will
                  verify and process your request.
                </p>
              </div>

              <div className="rounded-md border p-4 space-y-2 text-sm">
                <p className="font-medium text-foreground">What gets deleted</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Your profile, contact details, password and login credentials</li>
                  <li>Your saved addresses, payment method tokens and chat history</li>
                  <li>Your ride request, route and bid history</li>
                </ul>
                <p className="font-medium text-foreground pt-2">What we keep (legal & financial obligation)</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Anonymised transaction records (HMRC requires 6 years)</li>
                  <li>Safety incident reports if any have been raised against your account</li>
                  <li>Driver compliance records (DBS, DVLA, insurance) if you were a driver</li>
                </ul>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Account email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Help us improve — tell us why you're leaving."
                    rows={3}
                    data-testid="input-reason"
                  />
                </div>

                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="mt-1"
                    data-testid="checkbox-confirm"
                  />
                  <span>
                    I understand this will permanently delete my Saviaj account and the personal data listed above.
                    This action cannot be undone.
                  </span>
                </label>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-error">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="destructive"
                  className="w-full min-h-[48px]"
                  disabled={submitting || !email || !confirm}
                  data-testid="button-submit"
                >
                  {submitting ? "Submitting…" : "Request account deletion"}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Need help? Email <a href="mailto:support@sibranet.com" className="underline">support@sibranet.com</a>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
