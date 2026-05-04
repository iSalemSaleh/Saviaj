import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Mail, Loader2, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailVerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (email: string, verificationToken: string) => void;
  initialEmail?: string;
}

export function EmailVerificationModal({ open, onClose, onVerified, initialEmail = "" }: EmailVerificationModalProps) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState(initialEmail);
  const [otpCode, setOtpCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(8);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (initialEmail && initialEmail !== email) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (!open) {
      setStep("email");
      setOtpCode("");
      setDemoCode(null);
      setContinuationToken(null);
      setError(null);
      setUserExists(false);
      setCountdown(0);
    }
  }, [open]);

  const handleSendCode = async () => {
    setError(null);
    setUserExists(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/email-otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.waitSeconds) {
          setCountdown(data.waitSeconds);
        }
        if (response.status === 409 && data.userExists) {
          setUserExists(true);
          setError(data.message || "This email already has an account. Please sign in instead.");
          setIsLoading(false);
          return;
        }
        throw new Error(data.message || "Failed to send code");
      }

      if (data.verifiedAlready && data.verificationToken) {
        toast({
          title: "Email recognised",
          description: "Your email was previously verified. Proceeding to registration.",
        });
        onVerified(data.email || email, data.verificationToken);
        return;
      }

      if (data.demoMode && data.demoCode) {
        setDemoCode(data.demoCode);
      }

      if (data.continuationToken) {
        setContinuationToken(data.continuationToken);
      }

      if (data.codeLength) {
        setCodeLength(data.codeLength);
      }

      setStep("otp");
      setCountdown(60);
      toast({
        title: "Code sent",
        description: `Enter the ${data.codeLength || 8}-digit code sent to your email`,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/email-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode, continuationToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to verify code");
      }

      toast({
        title: "Email verified",
        description: "Your email has been verified successfully",
      });

      onVerified(data.email, data.verificationToken);
    } catch (err: any) {
      setError(err.message);
      setOtpCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    setDemoCode(null);
    setOtpCode("");
    await handleSendCode();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Verify Your Email
          </DialogTitle>
          <DialogDescription>
            {step === "email" 
              ? "Enter your email address to receive a verification code"
              : `Enter the ${codeLength}-digit code sent to your email`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {step === "email" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-verification-email"
                />
              </div>

              {userExists ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-100">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span data-testid="text-user-exists-message">{error}</span>
                  </div>
                  <Button
                    onClick={() => {
                      onClose();
                      setLocation("/login");
                    }}
                    className="w-full"
                    data-testid="button-go-to-login"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign In Instead
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setUserExists(false);
                      setError(null);
                      setEmail("");
                    }}
                    data-testid="button-try-different-email"
                  >
                    Use a different email
                  </Button>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="flex items-center gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}

                  <Button
                    onClick={handleSendCode}
                    disabled={isLoading || !email || countdown > 0}
                    className="w-full"
                    data-testid="button-send-email-code"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : countdown > 0 ? (
                      `Wait ${countdown}s`
                    ) : (
                      "Send Verification Code"
                    )}
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Code sent to <span className="font-medium">{email}</span>
                </p>
              </div>

              {demoCode && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                  <p className="text-sm text-amber-800 dark:text-amber-200 text-center">
                    <strong>Demo Mode:</strong> Your code is <span className="font-mono font-bold text-lg">{demoCode}</span>
                  </p>
                </div>
              )}

              <div className="flex justify-center">
                <InputOTP
                  maxLength={codeLength}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={isLoading}
                  data-testid="input-email-otp"
                >
                  <InputOTPGroup>
                    {Array.from({ length: codeLength }).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <div className="flex items-center justify-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleVerifyCode}
                disabled={isLoading || otpCode.length !== codeLength}
                className="w-full"
                data-testid="button-verify-email-code"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Verify Code
                  </>
                )}
              </Button>

              <div className="flex justify-between items-center text-sm">
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-change-email"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={countdown > 0}
                  className={countdown > 0 ? "text-muted-foreground" : "text-primary hover:underline"}
                  data-testid="button-resend-email-code"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
