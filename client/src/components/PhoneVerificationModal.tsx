import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Phone, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PhoneVerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (phoneNumber: string, verificationToken: string) => void;
}

export function PhoneVerificationModal({ open, onClose, onVerified }: PhoneVerificationModalProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setPhoneNumber("");
      setOtpCode("");
      setDemoCode(null);
      setError(null);
      setCountdown(0);
      localStorage.removeItem('atlasride_verified_phone');
      localStorage.removeItem('atlasride_phone_token');
    }
  }, [open]);

  const handleSendCode = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.waitSeconds) {
          setCountdown(data.waitSeconds);
        }
        throw new Error(data.message || "Failed to send code");
      }

      if (data.demoMode && data.demoCode) {
        setDemoCode(data.demoCode);
      }

      setStep("otp");
      setCountdown(60);
      toast({
        title: "Code sent",
        description: "Enter the 6-digit code to verify your phone",
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
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to verify code");
      }

      toast({
        title: "Phone verified",
        description: "Your phone number has been verified successfully",
      });

      onVerified(data.phoneNumber, data.verificationToken);
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
            <Phone className="h-5 w-5 text-primary" />
            Verify Your Phone
          </DialogTitle>
          <DialogDescription>
            {step === "phone" 
              ? "Enter your UK mobile number to receive a verification code"
              : "Enter the 6-digit code sent to your phone"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {step === "phone" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="07XXX XXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-phone"
                />
                <p className="text-xs text-muted-foreground">
                  UK mobile numbers only (starting with 07 or +44 7)
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleSendCode}
                disabled={isLoading || !phoneNumber || countdown > 0}
                className="w-full"
                data-testid="button-send-code"
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
          ) : (
            <>
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Code sent to <span className="font-medium">{phoneNumber}</span>
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
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={isLoading}
                  data-testid="input-otp"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
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
                disabled={isLoading || otpCode.length !== 6}
                className="w-full"
                data-testid="button-verify-code"
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
                  onClick={() => setStep("phone")}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-change-phone"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={countdown > 0}
                  className={countdown > 0 ? "text-muted-foreground" : "text-primary hover:underline"}
                  data-testid="button-resend-code"
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
