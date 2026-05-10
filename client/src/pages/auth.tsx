import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Car, Users, Shield, UserPlus, Mail } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRideLogo_1767134626458.png";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Link } from "wouter";

export default function AuthPage() {
  const [rememberMe, setRememberMe] = useState(true);

  const handleEmailSignIn = () => {
    if (rememberMe) {
      localStorage.setItem('atlasride_remember', 'true');
    } else {
      localStorage.removeItem('atlasride_remember');
    }
    window.location.href = "/login";
  };

  const handleEmailSignUp = () => {
    window.location.href = "/signup";
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

          <div className="space-y-3">
            <Button 
              onClick={handleEmailSignIn}
              className="w-full h-12 text-lg shadow-lg"
              size="lg"
              data-testid="button-email-signin"
            >
              <Mail className="mr-2 h-5 w-5" />
              Sign In
            </Button>

            <GoogleSignInButton className="w-full h-12 text-base" showConsentNotice />

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">New to AtlasRide?</span>
              </div>
            </div>

            <Button 
              onClick={handleEmailSignUp}
              variant="secondary"
              className="w-full h-12 text-lg"
              size="lg"
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

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link
                href="/terms"
                className="underline hover:text-foreground"
                data-testid="link-terms"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline hover:text-foreground"
                data-testid="link-privacy"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        Powered by secure authentication
      </p>
    </div>
  );
}
