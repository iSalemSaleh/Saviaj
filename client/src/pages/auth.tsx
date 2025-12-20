import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { MapPin, Car, Users, Shield, Loader2, UserPlus, LogIn, Mail, Phone, Chrome, Apple } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRide_Logo_Design_1765317206292.png";
import { PhoneVerificationModal } from "@/components/PhoneVerificationModal";

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
              {/* Sign In Options */}
              <Button 
                onClick={handleSocialSignIn}
                className="w-full h-12 text-lg shadow-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-social-signin"
              >
                {isLoading === 'social' ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-5 w-5" />
                    Sign In with Google / Apple / X
                  </>
                )}
              </Button>

              <Button 
                onClick={handleEmailSignIn}
                variant="outline"
                className="w-full h-12 text-lg"
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

              <Button 
                onClick={handleSocialSignIn}
                variant="secondary"
                className="w-full h-12 text-lg"
                size="lg"
                disabled={isLoading !== null}
                data-testid="button-social-signup"
              >
                {isLoading === 'social' ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Chrome className="mr-2 h-5 w-5" />
                    Google / Apple / X
                  </>
                )}
              </Button>

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
