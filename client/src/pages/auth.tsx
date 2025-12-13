import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Car, Users, Shield, Loader2, UserPlus, LogIn } from "lucide-react";
import atlasRideLogo from "@assets/AtlasRide_Logo_Design_1765317206292.png";

export default function AuthPage() {
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState<'signin' | 'signup' | null>(null);

  const handleSignIn = () => {
    setIsLoading('signin');
    const loginUrl = rememberMe ? "/api/login?remember=true" : "/api/login";
    window.location.href = loginUrl;
  };

  const handleSignUp = () => {
    setIsLoading('signup');
    localStorage.setItem('atlasride_signup', 'true');
    const loginUrl = rememberMe ? "/api/login?remember=true" : "/api/login";
    window.location.href = loginUrl;
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
              onClick={handleSignIn}
              className="w-full h-12 text-lg shadow-lg"
              size="lg"
              disabled={isLoading !== null}
              data-testid="button-signin"
            >
              {isLoading === 'signin' ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>

            <Button 
              onClick={handleSignUp}
              variant="outline"
              className="w-full h-12 text-lg"
              size="lg"
              disabled={isLoading !== null}
              data-testid="button-signup"
            >
              {isLoading === 'signup' ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-5 w-5" />
                  Create Account
                </>
              )}
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
              Sign in with Google, GitHub, or email. By continuing, you agree to our Terms of Service and Privacy Policy.
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
