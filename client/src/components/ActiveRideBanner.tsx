import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Car, ChevronRight } from "lucide-react";

interface ActiveRideResponse {
  id: number;
  status: string;
  pickupLocation?: string | null;
  dropoffLocation?: string | null;
}

export default function ActiveRideBanner() {
  const [, navigate] = useLocation();
  const { data: ride } = useQuery<ActiveRideResponse | null>({
    queryKey: ["/api/rides/active"],
    refetchInterval: 8000,
    staleTime: 4000,
  });

  if (!ride || !ride.id) return null;

  const label = ride.dropoffLocation
    ? `Heading to ${ride.dropoffLocation.replace(/^Route:\s*/, "")}`
    : "You have an active ride";

  return (
    <button
      onClick={() => navigate(`/ride/${ride.id}`)}
      data-testid="banner-active-ride"
      className="w-full bg-primary text-primary-foreground px-4 py-2 flex items-center gap-2 text-sm hover:bg-primary/90 transition-colors"
    >
      <Car className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate font-medium">{label}</span>
      <span className="text-xs opacity-80">View</span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </button>
  );
}
