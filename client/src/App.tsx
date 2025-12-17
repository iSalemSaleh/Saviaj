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
import DriverProfilePage from "@/pages/driver-profile";
import AuthPage from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import RideTrackingPage from "@/pages/ride-tracking";
import SignupPage from "@/pages/signup";
import LoginPage from "@/pages/login";
import BecomeDriverPage from "@/pages/become-driver";
import SplashScreen from "@/components/SplashScreen";
import HistoryPage from "@/pages/history";

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
      <Route path="/onboarding" component={OnboardingRoute} />
      <Route path="/ride/:id">
        <ProtectedRoute component={RideTrackingPage} />
      </Route>
      <Route path="/driver/:id" component={DriverProfilePage} />
      <Route path="/history">
        <ProtectedRoute component={HistoryPage} />
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
