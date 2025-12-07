import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, X } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const NavLinks = () => (
    <>
      <Link href="/rider">
        <a className={`text-sm font-medium transition-colors hover:text-primary ${location === "/rider" ? "text-primary" : "text-muted-foreground"}`}>
          Find a Ride
        </a>
      </Link>
      <Link href="/driver">
        <a className={`text-sm font-medium transition-colors hover:text-primary ${location === "/driver" ? "text-primary" : "text-muted-foreground"}`}>
          Offer a Ride
        </a>
      </Link>
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/">
          <a className="flex items-center gap-2 font-display text-xl font-bold text-primary">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MapPin className="h-5 w-5" />
            </div>
            AtlasRide
          </a>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex md:items-center md:gap-8">
          <NavLinks />
          <div className="flex items-center gap-4">
            <Link href="/auth">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/auth">
              <Button size="sm">Sign up</Button>
            </Link>
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
                <Link href="/rider" onClick={() => setIsOpen(false)}>
                  <span className="text-lg font-medium">Find a Ride</span>
                </Link>
                <Link href="/driver" onClick={() => setIsOpen(false)}>
                  <span className="text-lg font-medium">Offer a Ride</span>
                </Link>
                <div className="h-px bg-border my-2" />
                <Link href="/auth" onClick={() => setIsOpen(false)}>
                  <Button className="w-full">Sign In / Sign Up</Button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}