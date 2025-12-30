import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Car, Users, Shield, Loader2, UserPlus, Mail, Phone } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRideLogo_1767128702037.png";
import { PhoneVerificationModal } from "@/components/PhoneVerificationModal";

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const XIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function AuthPage() {
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [showSignUpOptions, setShowSignUpOptions] = useState(false);

  const handleSocialSignIn = () => {
    setIsLoading('social');
    const loginUrl = rememberMe ? "/api/login?remember=true" : "/api/login";
    window.location.href = loginUrl;
  };

  const handleEmailSignUp = () => {
    localStorage.setItem('atlasride_signup', 'true');
    window.location.href = "/signup";
  };

  const handlePhoneSignUp = () => {
    setShowPhoneVerification(true);
  };

  const handlePhoneVerified = (phoneNumber: string, verificationToken: string) => {
    setShowPhoneVerification(false);
    setIsLoading('phone');
    localStorage.setItem('atlasride_signup', 'true');
    localStorage.setItem('atlasride_verified_phone', phoneNumber);
    localStorage.setItem('atlasride_phone_token', verificationToken);
    const loginUrl = rememberMe ? "/api/login?remember=true" : "/api/login";
    window.location.href = loginUrl;
  };

  const handleEmailSignIn = () => {
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <img 
              src={atlasRideLogo} 
              alt="AtlasRide" 
              className="h-20 w-20 object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <CardTitle className="text-3xl font-bold text-primary">AtlasRide</CardTitle>
          <CardDescription className="text-base">
            Your ride, your price. Join the democratized transportation network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-3 py-4">
            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
              <Car className="h-6 w-6 text-primary mb-2" />
              <span className="text-xs text-muted-foreground">Fair Pricing</span>
            </div>
            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
              <Users className="h-6 w-6 text-secondary mb-2" />
              <span className="text-xs text-muted-foreground">Community</span>
            </div>
            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
              <Shield className="h-6 w-6 text-accent mb-2" />
              <span className="text-xs text-muted-foreground">Verified</span>
            </div>
          </div>

          {!showSignUpOptions ? (
            <div className="space-y-3">
              {/* Social Sign In Options */}
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-google-signin"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                </Button>
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-apple-signin"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <AppleIcon />
                  )}
                </Button>
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-x-signin"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <XIcon />
                  )}
                </Button>
              </div>

              <Button 
                onClick={handleEmailSignIn}
                className="w-full h-12 text-lg shadow-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-email-signin"
              >
                <Mail className="mr-2 h-5 w-5" />
                Sign In with Email
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">New to AtlasRide?</span>
                </div>
              </div>

              <Button 
                onClick={() => setShowSignUpOptions(true)}
                variant="secondary"
                className="w-full h-12 text-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-show-signup"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Create Account
              </Button>

              <div className="flex items-center justify-center space-x-2 pt-2">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  data-testid="checkbox-remember"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Stay signed in
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground mb-4">
                Choose how you'd like to create your account
              </p>

              <Button 
                onClick={handleEmailSignUp}
                className="w-full h-12 text-lg shadow-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-email-signup"
              >
                <Mail className="mr-2 h-5 w-5" />
                Sign Up with Email
              </Button>

              <Button 
                onClick={handlePhoneSignUp}
                variant="outline"
                className="w-full h-12 text-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-phone-signup"
              >
                {isLoading === 'phone' ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-5 w-5" />
                    Sign Up with Phone
                  </>
                )}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-google-signup"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                </Button>
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-apple-signup"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <AppleIcon />
                  )}
                </Button>
                <Button 
                  onClick={handleSocialSignIn}
                  variant="outline"
                  className="h-12"
                  disabled={isLoading !== null}
                  data-testid="button-x-signup"
                >
                  {isLoading === 'social' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <XIcon />
                  )}
                </Button>
              </div>

              <Button 
                onClick={() => setShowSignUpOptions(false)}
                variant="ghost"
                className="w-full"
                size="sm"
                data-testid="button-back-signin"
              >
                ← Back to Sign In
              </Button>
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        Powered by secure authentication
      </p>

      <PhoneVerificationModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        onVerified={handlePhoneVerified}
      />
    </div>
  );
}
