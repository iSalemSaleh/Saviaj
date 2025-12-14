import { useState, useCallback } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import RiderPage from "@/pages/rider";
import DriverPage from "@/pages/driver";
import AuthPage from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import RideTrackingPage from "@/pages/ride-tracking";
import SplashScreen from "@/components/SplashScreen";

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
        <ProtectedRoute component={DriverPage} />
      </Route>
      <Route path="/auth" component={AuthRoute} />
      <Route path="/onboarding" component={OnboardingRoute} />
      <Route path="/ride/:id">
        <ProtectedRoute component={RideTrackingPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
