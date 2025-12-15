import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Car, MapPin, UserPlus } from "lucide-react";
import heroBg from "@assets/generated_images/modern_abstract_city_map_with_motion_blur_lines.png";
import { useAuth } from "@/hooks/useAuth";

export default function Hero() {
  const { user } = useAuth();
  const isDriver = (user as any)?.isDriver === true;

  return (
    <div className="relative overflow-hidden bg-background py-24 sm:py-32">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="Abstract City Map" 
          className="h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background" />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-primary sm:text-6xl mb-6">
            Your Ride, <span className="text-secondary">Your Price.</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            A democratized transportation marketplace. Riders set the price, drivers choose their routes. 
            No algorithms, just fair connections.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button asChild size="lg" className="h-12 px-8 text-md shadow-lg shadow-primary/20" data-testid="button-find-ride">
              <Link href="/rider">
                Find a Ride <MapPin className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {isDriver ? (
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-md bg-white/50 backdrop-blur-sm hover:bg-white/80" data-testid="button-offer-ride">
                <Link href="/driver">
                  Offer a Ride <Car className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : user ? (
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-md bg-white/50 backdrop-blur-sm hover:bg-white/80" data-testid="button-become-driver">
                <Link href="/become-driver">
                  Become a Driver <UserPlus className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-md bg-white/50 backdrop-blur-sm hover:bg-white/80" data-testid="button-offer-ride">
                <Link href="/driver">
                  Offer a Ride <Car className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
