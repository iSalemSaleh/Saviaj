import { useState, useCallback } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { useEffect } from "react";
import { registerPushTokens } from "@/lib/pushClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import RiderPage from "@/pages/rider";
import DriverPage from "@/pages/driver";
import DriverProfilePage from "@/pages/driver-profile";
import AuthPage from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import RideTrackingPage from "@/pages/ride-tracking";
import SignupPage from "@/pages/signup";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import BecomeDriverPage from "@/pages/become-driver";
import SplashScreen from "@/components/SplashScreen";
import HistoryPage from "@/pages/history";
import SettingsPage from "@/pages/settings";
import LegalPage from "@/pages/legal-page";
import LegalIndexPage from "@/pages/legal-index";
import DeleteAccountPage from "@/pages/delete-account";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth" />;
  }

  if (user && !user.firstName && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  return <Component />;
}

function DriverProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth" />;
  }

  if (user && !user.firstName) {
    return <Redirect to="/onboarding" />;
  }

  if (user && !(user as any).isDriver) {
    return <Redirect to="/become-driver" />;
  }

  return <Component />;
}

function OnboardingRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth" />;
  }

  if (user && user.firstName) {
    return <Redirect to="/" />;
  }

  return <OnboardingPage />;
}

function AuthRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} duration={2500} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    if (user && !user.firstName) {
      return <Redirect to="/onboarding" />;
    }
    return <Redirect to="/" />;
  }

  return <AuthPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute component={Home} />
      </Route>
      <Route path="/rider">
        <ProtectedRoute component={RiderPage} />
      </Route>
      <Route path="/driver">
        <DriverProtectedRoute component={DriverPage} />
      </Route>
      <Route path="/become-driver">
        <ProtectedRoute component={BecomeDriverPage} />
      </Route>
      <Route path="/auth" component={AuthRoute} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/onboarding" component={OnboardingRoute} />
      <Route path="/ride/:id">
        <ProtectedRoute component={RideTrackingPage} />
      </Route>
      <Route path="/driver/:id" component={DriverProfilePage} />
      <Route path="/history">
        <ProtectedRoute component={HistoryPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      {/* Legal documents — every clean URL variant routes to the same
          rendered page so we can hand out short links from emails,
          receipts, deeplinks, etc. without worrying about underscore
          vs hyphen casing. The /legal index lists them all. */}
      <Route path="/legal" component={LegalIndexPage} />
      <Route path="/terms">
        <LegalPage doc="terms" />
      </Route>
      <Route path="/terms-of-service">
        <LegalPage doc="terms" />
      </Route>
      <Route path="/terms_of_service">
        <LegalPage doc="terms" />
      </Route>
      <Route path="/privacy">
        <LegalPage doc="privacy" />
      </Route>
      <Route path="/privacy-policy">
        <LegalPage doc="privacy" />
      </Route>
      <Route path="/privacy_policy">
        <LegalPage doc="privacy" />
      </Route>
      <Route path="/refund-policy">
        <LegalPage doc="refund-policy" />
      </Route>
      <Route path="/refund_policy">
        <LegalPage doc="refund-policy" />
      </Route>
      <Route path="/cancellation-policy">
        <LegalPage doc="cancellation-policy" />
      </Route>
      <Route path="/cancellation_policy">
        <LegalPage doc="cancellation-policy" />
      </Route>
      <Route path="/legal/:doc" component={LegalPage} />
      <Route path="/delete-account" component={DeleteAccountPage} />
      <Route path="/account/delete" component={DeleteAccountPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PushBootstrap() {
  const { isAuthenticated } = useAuth();
  useEffect(() => { if (isAuthenticated) registerPushTokens(); }, [isAuthenticated]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SonnerToaster
          position="top-right"
          richColors
          closeButton
          offset="calc(env(safe-area-inset-top, 0px) + 16px)"
          style={{
            ['--toast-padding' as any]: '0px',
            paddingRight: 'env(safe-area-inset-right, 0px)',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
          }}
        />
        <PushBootstrap />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
