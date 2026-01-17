import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, KeyRound, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import atlasRideLogo from "@assets/AtlasRideLogo_1767134626458.png";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type ResetStep = "email" | "verify" | "newPassword" | "success";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [continuationToken, setContinuationToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [codeLength, setCodeLength] = useState(8);

  const requestOtpMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await apiRequest("POST", "/api/auth/password-reset/request", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.continuationToken) {
        setContinuationToken(data.continuationToken);
        setCodeLength(data.codeLength || 8);
        setStep("verify");
        setError("");
        setSuccessMessage(`A verification code has been sent to ${email}`);
      } else {
        // Email doesn't exist - use generic message to prevent account enumeration
        setError("");
        setSuccessMessage("If an account exists with this email, a verification code has been sent. Please check your inbox.");
      }
    },
    onError: (error: any) => {
      setError(error.message || "Failed to send reset code. Please try again.");
      setSuccessMessage("");
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (data: { email: string; code: string; continuationToken: string }) => {
      const response = await apiRequest("POST", "/api/auth/password-reset/verify", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      setResetToken(data.resetToken);
      setStep("newPassword");
      setError("");
    },
    onError: (error: any) => {
      setError(error.message || "Invalid code. Please try again.");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { email: string; resetToken: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/auth/password-reset/complete", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      setError("");
    },
    onError: (error: any) => {
      setError(error.message || "Failed to reset password. Please try again.");
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    requestOtpMutation.mutate({ email });
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (otpCode.length < codeLength) {
      setError(`Please enter the ${codeLength}-digit code sent to your email`);
      return;
    }
    verifyOtpMutation.mutate({ email, code: otpCode, continuationToken });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    resetPasswordMutation.mutate({ email, resetToken, newPassword });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => step === "email" ? setLocation("/login") : setStep("email")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back{step === "email" ? " to Login" : ""}</span>
        </button>
        <div className="flex items-center gap-2">
          <img src={atlasRideLogo} alt="AtlasRide" className="h-8 w-8" />
          <span className="font-bold text-lg text-primary">AtlasRide</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {step === "email" && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Forgot Password?</CardTitle>
                <CardDescription>
                  Enter your email address and we'll send you a verification code to reset your password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                )}
                {successMessage && (
                  <div className="mb-4 p-3 bg-green-500/10 text-green-600 rounded-lg text-sm">
                    {successMessage}
                  </div>
                )}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-reset-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={requestOtpMutation.isPending}
                    data-testid="button-send-code"
                  >
                    {requestOtpMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Verification Code"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === "verify" && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <KeyRound className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Enter Verification Code</CardTitle>
                <CardDescription>
                  We sent a {codeLength}-digit code to {email}. Enter it below to continue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <form onSubmit={handleVerifySubmit} className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={codeLength}
                      value={otpCode}
                      onChange={setOtpCode}
                      data-testid="input-otp-code"
                    >
                      <InputOTPGroup>
                        {Array.from({ length: codeLength }).map((_, i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={verifyOtpMutation.isPending || otpCode.length < codeLength}
                    data-testid="button-verify-code"
                  >
                    {verifyOtpMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Code"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setOtpCode("");
                      requestOtpMutation.mutate({ email });
                    }}
                    disabled={requestOtpMutation.isPending}
                    data-testid="button-resend-code"
                  >
                    Resend Code
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === "newPassword" && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <KeyRound className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Create New Password</CardTitle>
                <CardDescription>
                  Enter a new password for your account. Make it at least 8 characters long.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resetPasswordMutation.isPending}
                    data-testid="button-reset-password"
                  >
                    {resetPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === "success" && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle className="text-2xl">Password Reset Successful!</CardTitle>
                <CardDescription>
                  Your password has been reset. You can now log in with your new password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/login")}
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
