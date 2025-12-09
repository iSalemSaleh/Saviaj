import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Menu } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { user, isLoading } = useAuth();

  const NavLinks = () => (
    <>
      <Link 
        href="/rider"
        className={`text-sm font-medium transition-colors hover:text-primary ${location === "/rider" ? "text-primary" : "text-muted-foreground"}`}
      >
        Find a Ride
      </Link>
      <Link 
        href="/driver"
        className={`text-sm font-medium transition-colors hover:text-primary ${location === "/driver" ? "text-primary" : "text-muted-foreground"}`}
      >
        Offer a Ride
      </Link>
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold text-primary">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="h-5 w-5" />
          </div>
          AtlasRide
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex md:items-center md:gap-8">
          <NavLinks />
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Welcome, {(user as any).firstName || 'User'}
                </span>
                <a href="/api/logout">
                  <Button variant="ghost" size="sm" data-testid="button-logout">Log out</Button>
                </a>
              </>
            ) : (
              <>
                <a href="/api/login">
                  <Button variant="ghost" size="sm" data-testid="button-login">Log in</Button>
                </a>
                <a href="/api/login">
                  <Button size="sm" data-testid="button-signup">Sign up</Button>
                </a>
              </>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-6 mt-8">
                <Link href="/rider" onClick={() => setIsOpen(false)} className="text-lg font-medium">
                  Find a Ride
                </Link>
                <Link href="/driver" onClick={() => setIsOpen(false)} className="text-lg font-medium">
                  Offer a Ride
                </Link>
                <div className="h-px bg-border my-2" />
                {user ? (
                  <a href="/api/logout" onClick={() => setIsOpen(false)}>
                    <Button className="w-full" variant="outline">Log out</Button>
                  </a>
                ) : (
                  <a href="/api/login" onClick={() => setIsOpen(false)}>
                    <Button className="w-full">Sign In / Sign Up</Button>
                  </a>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
