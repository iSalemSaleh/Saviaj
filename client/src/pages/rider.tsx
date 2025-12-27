import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Clock, PoundSterling, Calendar, ArrowRight, Loader2, Navigation, CalendarDays, Users, Edit2, X, Star, Shield, Car, Radio, Crown, ChevronDown, ChevronUp, Crosshair, Route } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";
import { DateTimePicker } from "@/components/DateTimePicker";
import { RiderLocationMap } from "@/components/map/RiderLocationMap";

interface DriverInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  driverRating: string | null;
  totalRatingsAsDriver: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColor: string | null;
  vehicleRegistration: string | null;
  driverVerified: boolean | null;
}

interface DriverRoute {
  id: number;
  driverId: string;
  startLocation: string;
  endLocation: string;
  startLat: string | null;
  startLng: string | null;
  endLat: string | null;
  endLng: string | null;
  departureTime: string;
  availableSeats: number;
  totalSeats: number;
  pricePerSeat: string | null;
  maxDetourMiles: string;
  status: string;
  driver?: DriverInfo;
}

interface RiderOffer {
  id: number;
  riderId: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: string | null;
  pickupLng: string | null;
  dropoffLat: string | null;
  dropoffLng: string | null;
  offerPrice: string;
  requestedTime: string;
  status: string;
}

interface Bid {
  id: number;
  riderOfferId: number;
  driverId: string;
  bidPrice: string;
  message: string | null;
  status: string;
  createdAt: string;
  driver?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    driverRating: string | null;
    totalRatingsAsDriver: number | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
  };
}

interface UserLocation {
  lat: number;
  lng: number;
}

interface NearbyDriver {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  driverRating: string | null;
  totalRatingsAsDriver: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColor: string | null;
  vehicleRegistration: string | null;
  ratePerMile: string | null;
  driverTagline: string | null;
  distanceFromPickup: number;
  currentLat: string | null;
  currentLng: string | null;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function RiderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{lat: number; lon: number} | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{lat: number; lon: number} | null>(null);
  const [requestedTime, setRequestedTime] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [showFutureDates, setShowFutureDates] = useState(true);
  const [isCurrentLocationPickup, setIsCurrentLocationPickup] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<RiderOffer | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [bidsDialogOpen, setBidsDialogOpen] = useState(false);
  const [viewingBidsForOffer, setViewingBidsForOffer] = useState<RiderOffer | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [requestingDriverId, setRequestingDriverId] = useState<string | null>(null);
  const [routesExpanded, setRoutesExpanded] = useState(false);
  const [driversExpanded, setDriversExpanded] = useState(false);
  const [allRoutesExpanded, setAllRoutesExpanded] = useState(false);
  const [driversCardOpen, setDriversCardOpen] = useState(false);
  const [routesCardOpen, setRoutesCardOpen] = useState(false);
  const [myRoutesCardOpen, setMyRoutesCardOpen] = useState(false);
  const [centerTrigger, setCenterTrigger] = useState(0); // Increment to recenter map
  const [formCollapsed, setFormCollapsed] = useState(false); // Collapsible form
  const [driversPage, setDriversPage] = useState(0); // Pagination for drivers
  const [routesPage, setRoutesPage] = useState(0); // Pagination for routes
  const ITEMS_PER_PAGE = 10;
  const INITIAL_DISPLAY_COUNT = 5;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          setPickupCoords({ lat, lon: lng });
          setIsCurrentLocationPickup(true);
          setLocationLoading(false);
          
          try {
            const response = await fetch(`/api/azure-maps/reverse-geocode?lat=${lat}&lon=${lng}`);
            const data = await response.json();
            if (data.address) {
              setPickupLocation(data.address);
            } else {
              setPickupLocation("Your current location");
            }
          } catch (error) {
            console.log("Reverse geocode error:", error);
            setPickupLocation("Your current location");
          }
        },
        (error) => {
          console.log("Geolocation error:", error.message);
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationLoading(false);
    }
  }, []);

  const handlePickupChange = (value: string, lat?: number, lon?: number) => {
    setPickupLocation(value);
    setIsCurrentLocationPickup(false);
    if (lat !== undefined && lon !== undefined) {
      setPickupCoords({ lat, lon });
    } else if (!value) {
      setPickupCoords(null);
    }
  };

  const handleDropoffChange = (value: string, lat?: number, lon?: number) => {
    setDropoffLocation(value);
    if (lat !== undefined && lon !== undefined) {
      setDropoffCoords({ lat, lon });
    } else if (!value) {
      setDropoffCoords(null);
    }
  };

  const { data: driverRoutes = [], isLoading: routesLoading } = useQuery<DriverRoute[]>({
    queryKey: ["/api/driver-routes"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (pickupCoords) {
        params.append('riderLat', pickupCoords.lat.toString());
        params.append('riderLng', pickupCoords.lon.toString());
      }
      const url = `/api/driver-routes${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for nearby routes (stable display)
    staleTime: 4000, // Keep data fresh for 4 seconds
  });

  const { data: myOffers = [], isLoading: myOffersLoading } = useQuery<RiderOffer[]>({
    queryKey: ["/api/rider-offers/mine"],
    queryFn: async () => {
      const response = await fetch("/api/rider-offers/mine");
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 200, // Refresh every 0.2 seconds for time-critical bids
  });

  // Query for nearby commercial drivers (Pro drivers)
  const { data: nearbyDrivers = [], isLoading: nearbyDriversLoading } = useQuery<NearbyDriver[]>({
    queryKey: ["/api/drivers/nearby", pickupCoords?.lat, pickupCoords?.lon],
    queryFn: async () => {
      if (!pickupCoords) return [];
      const params = new URLSearchParams({
        lat: pickupCoords.lat.toString(),
        lng: pickupCoords.lon.toString(),
        maxDistance: '10', // 10 miles radius
      });
      const response = await fetch(`/api/drivers/nearby?${params.toString()}`);
      return response.json();
    },
    enabled: !!pickupCoords,
    refetchInterval: 1000, // Refresh every 1 second for nearby drivers
  });

  // Query for bids on a specific offer - refreshes every 0.2 seconds when dialog is open
  const { data: offerBids = [], isLoading: bidsLoading, refetch: refetchBids } = useQuery<Bid[]>({
    queryKey: ["/api/bids/offer", viewingBidsForOffer?.id],
    queryFn: async () => {
      if (!viewingBidsForOffer) return [];
      const response = await fetch(`/api/bids/offer/${viewingBidsForOffer.id}`);
      return response.json();
    },
    enabled: !!viewingBidsForOffer && bidsDialogOpen,
    refetchInterval: bidsDialogOpen ? 200 : false, // Refresh every 0.2 seconds when viewing bids
  });

  // Mutation to accept a bid - now redirects to payment
  const acceptBidMutation = useMutation({
    mutationFn: async (bidId: number) => {
      const response = await apiRequest("PATCH", `/api/bids/${bidId}/accept`, {});
      return response.json();
    },
    onSuccess: (data: { ride: { id: number }; clientSecret: string }) => {
      toast({
        title: "Offer Accepted!",
        description: "Redirecting to payment...",
      });
      setBidsDialogOpen(false);
      setViewingBidsForOffer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      // Navigate to ride page with payment info
      navigate(`/ride/${data.ride.id}?payment=pending&secret=${encodeURIComponent(data.clientSecret)}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept bid",
        variant: "destructive",
      });
    },
  });

  // Calculate estimated cost based on driver's rate and trip distance
  const getEstimatedCost = (driver: NearbyDriver): string | null => {
    if (!driver.ratePerMile || !pickupCoords || !dropoffCoords) return null;
    const tripDistance = calculateDistance(
      pickupCoords.lat, 
      pickupCoords.lon, 
      dropoffCoords.lat, 
      dropoffCoords.lon
    );
    const rate = parseFloat(driver.ratePerMile);
    const estimatedCost = tripDistance * rate;
    return estimatedCost.toFixed(2);
  };

  const myPendingOffers = useMemo(() => {
    const now = new Date();
    return myOffers.filter(offer => {
      if (offer.status !== "pending") return false;
      const requestedTime = new Date(offer.requestedTime);
      return requestedTime >= now;
    });
  }, [myOffers]);

  const reviseOfferMutation = useMutation({
    mutationFn: async ({ offerId, newPrice }: { offerId: number; newPrice: number }) => {
      const response = await apiRequest("PATCH", `/api/rider-offers/${offerId}/revise`, { offerPrice: newPrice });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Price Updated",
        description: "Your offer price has been revised.",
      });
      setEditDialogOpen(false);
      setEditPrice("");
      setSelectedOffer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers/mine"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revise offer",
        variant: "destructive",
      });
    },
  });

  const cancelOfferMutation = useMutation({
    mutationFn: async (offerId: number) => {
      const response = await apiRequest("PATCH", `/api/rider-offers/${offerId}/cancel`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Offer Cancelled",
        description: "Your ride request has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers/mine"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel offer",
        variant: "destructive",
      });
    },
  });

  const requestProDriverMutation = useMutation({
    mutationFn: async (driver: NearbyDriver) => {
      if (!pickupCoords || !dropoffCoords) throw new Error("Please select pickup and drop-off locations");
      
      const tripDistance = calculateDistance(
        pickupCoords.lat, pickupCoords.lon,
        dropoffCoords.lat, dropoffCoords.lon
      );
      const estimatedPrice = (tripDistance * parseFloat(driver.ratePerMile || "0")).toFixed(2);
      
      const response = await apiRequest("POST", "/api/pro-driver/request-ride", {
        driverId: driver.id,
        pickupLocation,
        dropoffLocation,
        pickupLat: pickupCoords.lat.toString(),
        pickupLng: pickupCoords.lon.toString(),
        dropoffLat: dropoffCoords.lat.toString(),
        dropoffLng: dropoffCoords.lon.toString(),
        estimatedPrice,
        scheduledTime: requestedTime || new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: (ride) => {
      toast({
        title: "Ride Requested!",
        description: "Your ride request has been sent to the driver. They will respond shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      navigate(`/ride/${ride.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to request ride. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setRequestingDriverId(null);
    },
  });

  const handleRequestProDriver = (driver: NearbyDriver) => {
    if (!dropoffCoords) {
      toast({
        title: "Destination Required",
        description: "Please enter your destination before requesting a ride.",
        variant: "destructive",
      });
      return;
    }
    setRequestingDriverId(driver.id);
    requestProDriverMutation.mutate(driver);
  };

  const handleRevisePrice = () => {
    if (!selectedOffer || !editPrice) return;
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 1 || price > 500) {
      toast({
        title: "Invalid Price",
        description: "Please enter a price between £1 and £500",
        variant: "destructive",
      });
      return;
    }
    reviseOfferMutation.mutate({ offerId: selectedOffer.id, newPrice: price });
  };

  const [currentTime, setCurrentTime] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredAndSortedRoutes = useMemo(() => {
    const now = new Date(currentTime);
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    let filtered = driverRoutes.filter(route => {
      const departureTime = new Date(route.departureTime);
      if (departureTime < now) return false;
      if (!showFutureDates && departureTime > twentyFourHoursLater) return false;
      return route.status === "active";
    });
    
    filtered.sort((a, b) => {
      if (userLocation && a.startLat && a.startLng && b.startLat && b.startLng) {
        const distA = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          parseFloat(a.startLat),
          parseFloat(a.startLng)
        );
        const distB = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          parseFloat(b.startLat),
          parseFloat(b.startLng)
        );
        const distDiff = distA - distB;
        if (distDiff !== 0) {
          return distDiff;
        }
      }
      return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
    });
    
    return filtered;
  }, [driverRoutes, userLocation, showFutureDates, currentTime]);

  const nearbyRoutes = useMemo(() => {
    if (!pickupCoords || !dropoffCoords) return [];
    
    return filteredAndSortedRoutes.filter(route => {
      if (!route.startLat || !route.startLng || !route.endLat || !route.endLng) return false;
      const routeStartLat = parseFloat(route.startLat);
      const routeStartLng = parseFloat(route.startLng);
      const routeEndLat = parseFloat(route.endLat);
      const routeEndLng = parseFloat(route.endLng);
      const maxDetour = parseFloat(route.maxDetourMiles) || 5;
      const distanceToStart = calculateDistance(pickupCoords.lat, pickupCoords.lon, routeStartLat, routeStartLng);
      const distanceToEnd = calculateDistance(dropoffCoords.lat, dropoffCoords.lon, routeEndLat, routeEndLng);
      return distanceToStart <= maxDetour && distanceToEnd <= maxDetour;
    });
  }, [filteredAndSortedRoutes, pickupCoords, dropoffCoords]);

  const getDistanceAndETA = (route: DriverRoute): { distance: string; eta: string } | null => {
    if (!userLocation || !route.startLat || !route.startLng) return null;
    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lng,
      parseFloat(route.startLat),
      parseFloat(route.startLng)
    );
    const etaMinutes = Math.round((distance / 20) * 60);
    const etaText = etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`;
    
    if (distance < 1) {
      return { distance: `${Math.round(distance * 1760)} yards`, eta: etaText };
    }
    return { distance: `${distance.toFixed(1)} mi`, eta: etaText };
  };

  const createOfferMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/rider-offers", data);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Your ride request has been posted!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers/mine"] });
      setDropoffLocation("");
      setDropoffCoords(null);
      setRequestedTime("");
      setOfferPrice("");
      
      if (userLocation) {
        setPickupCoords({ lat: userLocation.lat, lon: userLocation.lng });
        setIsCurrentLocationPickup(true);
        try {
          const response = await fetch(`/api/azure-maps/reverse-geocode?lat=${userLocation.lat}&lon=${userLocation.lng}`);
          const data = await response.json();
          if (data.address) {
            setPickupLocation(data.address);
          } else {
            setPickupLocation("Your current location");
          }
        } catch {
          setPickupLocation("Your current location");
        }
      } else {
        setPickupLocation("");
        setPickupCoords(null);
        setIsCurrentLocationPickup(false);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create ride request",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!pickupLocation || !dropoffLocation || !requestedTime || !offerPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(offerPrice);
    if (isNaN(price) || price < 1 || price > 500) {
      toast({
        title: "Invalid Price",
        description: "Please enter a price between £1 and £500",
        variant: "destructive",
      });
      return;
    }

    const selectedTime = new Date(requestedTime);
    if (selectedTime <= new Date()) {
      toast({
        title: "Invalid Time",
        description: "Please select a time in the future",
        variant: "destructive",
      });
      return;
    }

    createOfferMutation.mutate({
      pickupLocation,
      dropoffLocation,
      requestedTime: selectedTime.toISOString(),
      offerPrice: price,
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const getTimeUntilDeparture = (dateString: string): string => {
    const now = new Date();
    const departure = new Date(dateString);
    const diffMs = departure.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 60) return `Leaving in ${diffMins} mins`;
    if (diffHours < 24) return `Leaving in ${diffHours}h`;
    return formatDate(dateString);
  };

  const getConfirmedRiders = (route: DriverRoute): number => {
    return (route.totalSeats || route.availableSeats) - route.availableSeats;
  };

  return (
    <div className="relative h-screen overflow-hidden">
      {/* BACKGROUND: Full-screen Map */}
      <div className="fixed inset-0 z-0">
        <RiderLocationMap
          userLocation={userLocation}
          destination={dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lon } : undefined}
          nearbyDrivers={nearbyDrivers}
          showRoute={!!dropoffCoords}
          onRouteInfo={(distance, duration) => setRouteInfo({ distance, duration })}
          centerTrigger={centerTrigger}
        />
      </div>

      {/* OVERLAY: Fixed Navbar */}
      <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/60 border-b border-white/10">
        <Navbar />
      </div>
      
      {/* OVERLAY: Collapsible Request Form */}
      <div className={`fixed top-14 left-0 right-0 z-40 backdrop-blur-sm bg-background/40 border-b border-white/10 transition-all duration-300 overflow-hidden ${formCollapsed ? 'max-h-10' : 'max-h-56'}`}>
        <button
          onClick={() => setFormCollapsed(!formCollapsed)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:bg-white/10"
          data-testid="button-toggle-form"
        >
          <span className="font-medium">{formCollapsed ? 'Tap to request a ride' : 'Request a Ride'}</span>
          {formCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {!formCollapsed && (
          <form onSubmit={handleSubmit} className="px-3 pb-3 space-y-2">
            <PostcodeSearch
              value={pickupLocation}
              onChange={handlePickupChange}
              placeholder="Pickup address"
              iconColor="text-muted-foreground"
              testId="input-pickup"
              isCurrentLocation={isCurrentLocationPickup}
              compact
            />
            <PostcodeSearch
              value={dropoffLocation}
              onChange={handleDropoffChange}
              placeholder="Destination"
              iconColor="text-secondary"
              testId="input-dropoff"
              compact
            />
            <div className="flex gap-2">
              <DateTimePicker
                value={requestedTime}
                onChange={setRequestedTime}
                testId="input-time"
                className="w-1/2"
                compact
              />
              <div className="relative w-1/4">
                <PoundSterling className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input 
                  type="number" 
                  placeholder="Offer"
                  min="1"
                  max="500"
                  step="1"
                  className="pl-6 h-8 text-sm bg-white dark:bg-slate-900 border-gray-200"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  aria-label="Price offer"
                  data-testid="input-price"
                />
              </div>
              <Button 
                type="submit" 
                className="h-8 w-1/4 text-xs"
                disabled={createOfferMutation.isPending}
                data-testid="button-post-request"
              >
                {createOfferMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Post"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* OVERLAY: Target button to refocus map */}
      <button
        onClick={() => setCenterTrigger(prev => prev + 1)}
        className="fixed bottom-[280px] right-3 z-50 w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-gray-200 dark:border-slate-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        data-testid="button-refocus-map"
        title="Center on my location"
      >
        <Crosshair className="h-5 w-5 text-primary" />
      </button>

      {/* BOTTOM: Three Expandable Cards */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 space-y-2">
        
        {/* Card 1: Nearby Pro Drivers */}
        <div className={`backdrop-blur-md bg-background/70 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${driversCardOpen ? 'max-h-[50vh]' : ''}`}>
          <button
            onClick={() => {
              setDriversCardOpen(!driversCardOpen);
              if (!driversCardOpen) { setRoutesCardOpen(false); setMyRoutesCardOpen(false); setDriversPage(0); }
            }}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/10 transition-colors"
            data-testid="button-toggle-drivers-card"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Nearby Drivers</span>
              {nearbyDrivers.length > 0 && <Badge className="bg-primary text-white text-xs">{nearbyDrivers.length}</Badge>}
            </div>
            {driversCardOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          
          {/* Preview when collapsed - show nearest driver */}
          {!driversCardOpen && nearbyDrivers.length > 0 && (
            <div className="px-3 pb-2">
              {(() => {
                const driver = nearbyDrivers[0];
                const estimatedCost = getEstimatedCost(driver);
                return (
                  <div className="flex items-center gap-3 p-2 bg-white/20 dark:bg-white/5 rounded-lg">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={driver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.id}`} />
                      <AvatarFallback className="text-xs">{driver.firstName?.charAt(0) || 'D'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{driver.firstName || 'Driver'}</p>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                          {driver.driverRating ? parseFloat(driver.driverRating).toFixed(1) : 'New'}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">£{driver.ratePerMile}/mi • {driver.distanceFromPickup.toFixed(1)} mi away</p>
                    </div>
                    {estimatedCost && <Badge className="bg-primary text-white shrink-0">£{estimatedCost}</Badge>}
                  </div>
                );
              })()}
            </div>
          )}
          {!driversCardOpen && nearbyDrivers.length === 0 && !nearbyDriversLoading && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground text-center py-1">No Pro drivers nearby</p>
            </div>
          )}
          
          {/* Expanded content with pagination */}
          {driversCardOpen && (
            <div className="px-3 pb-3 overflow-y-auto max-h-[38vh]">
              {nearbyDriversLoading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-5 w-5 text-primary mx-auto animate-spin" />
                </div>
              ) : nearbyDrivers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No Pro drivers nearby</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {nearbyDrivers.slice(driversPage * ITEMS_PER_PAGE, (driversPage + 1) * ITEMS_PER_PAGE).map((driver) => {
                      const estimatedCost = getEstimatedCost(driver);
                      return (
                        <div key={driver.id} className="p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10" data-testid={`card-pro-driver-${driver.id}`}>
                          <Link href={`/driver/${driver.id}`} className="block" data-testid={`link-pro-driver-${driver.id}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={driver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.id}`} />
                                <AvatarFallback className="text-xs">{driver.firstName?.charAt(0) || 'D'}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate" data-testid={`text-pro-driver-name-${driver.id}`}>{driver.firstName || 'Driver'}</p>
                                <div className="flex items-center text-[10px] text-muted-foreground">
                                  <Star className="h-2 w-2 text-yellow-500 fill-yellow-500 mr-0.5" />
                                  {driver.driverRating ? parseFloat(driver.driverRating).toFixed(1) : 'New'}
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate mb-1">{driver.distanceFromPickup.toFixed(1)} mi away</p>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">£{driver.ratePerMile}/mi</span>
                              {estimatedCost && <Badge className="bg-primary text-white text-[10px] px-1">£{estimatedCost}</Badge>}
                            </div>
                          </Link>
                          <Button size="sm" className="w-full h-6 mt-1 text-[10px]" onClick={() => handleRequestProDriver(driver)} disabled={requestingDriverId === driver.id || !dropoffCoords} data-testid={`button-request-pro-driver-${driver.id}`}>
                            {requestingDriverId === driver.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Request'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Pagination controls */}
                  {nearbyDrivers.length > ITEMS_PER_PAGE && (
                    <div className="flex justify-center gap-2 mt-3">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={driversPage === 0} onClick={() => setDriversPage(p => p - 1)}>
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground self-center">
                        {driversPage + 1} / {Math.ceil(nearbyDrivers.length / ITEMS_PER_PAGE)}
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={(driversPage + 1) * ITEMS_PER_PAGE >= nearbyDrivers.length} onClick={() => setDriversPage(p => p + 1)}>
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Nearby Routes */}
        <div className={`backdrop-blur-md bg-background/70 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${routesCardOpen ? 'max-h-[50vh]' : ''}`}>
          <button
            onClick={() => {
              setRoutesCardOpen(!routesCardOpen);
              if (!routesCardOpen) { setDriversCardOpen(false); setMyRoutesCardOpen(false); setRoutesPage(0); }
            }}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/10 transition-colors"
            data-testid="button-toggle-routes-card"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Nearby Routes</span>
              {filteredAndSortedRoutes.length > 0 && <Badge variant="outline" className="text-xs">{filteredAndSortedRoutes.length}</Badge>}
            </div>
            {routesCardOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          
          {/* Preview when collapsed - show nearest route */}
          {!routesCardOpen && filteredAndSortedRoutes.length > 0 && (
            <div className="px-3 pb-2">
              {(() => {
                const route = filteredAndSortedRoutes[0];
                return (
                  <div className="flex items-center gap-3 p-2 bg-white/20 dark:bg-white/5 rounded-lg">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                      <AvatarFallback className="text-xs">{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{route.driver?.firstName || 'Driver'}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <Clock className="h-2 w-2 mr-0.5" />
                          {getTimeUntilDeparture(route.departureTime)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{route.startLocation} → {route.endLocation}</p>
                    </div>
                    {route.pricePerSeat && <Badge className="bg-primary text-white shrink-0">£{route.pricePerSeat}</Badge>}
                  </div>
                );
              })()}
            </div>
          )}
          {!routesCardOpen && filteredAndSortedRoutes.length === 0 && !routesLoading && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground text-center py-1">No routes available</p>
            </div>
          )}
          
          {/* Expanded content with pagination */}
          {routesCardOpen && (
            <div className="px-3 pb-3 overflow-y-auto max-h-[38vh]">
              {routesLoading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-5 w-5 text-primary mx-auto animate-spin" />
                </div>
              ) : filteredAndSortedRoutes.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No routes available</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {filteredAndSortedRoutes.slice(routesPage * ITEMS_PER_PAGE, (routesPage + 1) * ITEMS_PER_PAGE).map((route) => (
                      <div key={route.id} className="p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10" data-testid={`card-route-${route.id}`}>
                        <Link href={`/driver/${route.driverId}`} className="block" data-testid={`link-driver-profile-${route.id}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                              <AvatarFallback className="text-[10px]">{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate flex-1" data-testid={`text-driver-name-route-${route.id}`}>{route.driver?.firstName || 'Driver'}</span>
                            {route.pricePerSeat && <Badge className="bg-primary text-white text-[10px] px-1">£{route.pricePerSeat}</Badge>}
                          </div>
                          <div className="text-[10px] space-y-0.5 mb-1">
                            <p className="truncate"><span className="text-primary">●</span> {route.startLocation}</p>
                            <p className="truncate"><span className="text-secondary">●</span> {route.endLocation}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="h-2 w-2 mr-0.5" />
                            {getTimeUntilDeparture(route.departureTime)}
                          </Badge>
                        </Link>
                      </div>
                    ))}
                  </div>
                  {/* Pagination controls */}
                  {filteredAndSortedRoutes.length > ITEMS_PER_PAGE && (
                    <div className="flex justify-center gap-2 mt-3">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={routesPage === 0} onClick={() => setRoutesPage(p => p - 1)}>
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground self-center">
                        {routesPage + 1} / {Math.ceil(filteredAndSortedRoutes.length / ITEMS_PER_PAGE)}
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={(routesPage + 1) * ITEMS_PER_PAGE >= filteredAndSortedRoutes.length} onClick={() => setRoutesPage(p => p + 1)}>
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Card 3: My Routes (max 10 routes, no pagination) */}
        <div className={`backdrop-blur-md bg-background/70 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${myRoutesCardOpen ? 'max-h-[50vh]' : ''}`}>
          <button
            onClick={() => {
              setMyRoutesCardOpen(!myRoutesCardOpen);
              if (!myRoutesCardOpen) { setDriversCardOpen(false); setRoutesCardOpen(false); }
            }}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/10 transition-colors"
            data-testid="button-toggle-my-routes-card"
          >
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">My Routes</span>
              {myPendingOffers.length > 0 && <Badge className="bg-primary text-white text-xs">{myPendingOffers.length}/10</Badge>}
            </div>
            {myRoutesCardOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          
          {/* Preview when collapsed - show most recent route */}
          {!myRoutesCardOpen && myPendingOffers.length > 0 && (
            <div className="px-3 pb-2">
              {(() => {
                const offer = myPendingOffers[0];
                return (
                  <div className="flex items-center gap-3 p-2 bg-white/20 dark:bg-white/5 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{offer.pickupLocation}</p>
                      <p className="text-xs text-muted-foreground truncate">→ {offer.dropoffLocation}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className="bg-primary text-white">£{offer.offerPrice}</Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{formatDate(offer.requestedTime)}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          {!myRoutesCardOpen && myPendingOffers.length === 0 && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground text-center py-1">No pending requests</p>
            </div>
          )}
          
          {/* Expanded content (max 10, no pagination) */}
          {myRoutesCardOpen && (
            <div className="px-3 pb-3 overflow-y-auto max-h-[38vh]">
              {myPendingOffers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No pending requests</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Post a request above to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {myPendingOffers.slice(0, 10).map((offer) => (
                    <div key={offer.id} className="p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10" data-testid={`my-route-${offer.id}`}>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium truncate">{offer.pickupLocation}</p>
                          <p className="text-[10px] text-muted-foreground">to</p>
                          <p className="text-[10px] font-medium truncate">{offer.dropoffLocation}</p>
                        </div>
                        <Badge className="bg-primary text-white text-[10px] shrink-0">£{offer.offerPrice}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-1">{formatDate(offer.requestedTime)}</p>
                      <div className="flex flex-col gap-1">
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="h-6 text-[10px] w-full"
                          onClick={() => { setViewingBidsForOffer(offer); setBidsDialogOpen(true); }}
                          data-testid={`button-view-bids-${offer.id}`}
                        >
                          <Users className="h-2 w-2 mr-0.5" /> View Bids
                        </Button>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-5 text-[10px] flex-1" onClick={() => { setSelectedOffer(offer); setEditPrice(offer.offerPrice); setEditDialogOpen(true); }}>
                            <Edit2 className="h-2 w-2 mr-0.5" /> Edit
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 text-[10px] text-red-500" onClick={() => cancelOfferMutation.mutate(offer.id)}>
                            <X className="h-2 w-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Price Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise Offer Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedOffer && (
              <p className="text-sm text-muted-foreground">
                Current price: <strong>£{selectedOffer.offerPrice}</strong>
              </p>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">New Price (£)</label>
              <div className="relative">
                <PoundSterling className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="number"
                  placeholder="Enter new price"
                  min="1"
                  max="500"
                  className="pl-9"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  data-testid="input-edit-price"
                />
              </div>
            </div>
            <Button 
              onClick={handleRevisePrice}
              className="w-full"
              disabled={reviseOfferMutation.isPending || !editPrice}
              data-testid="button-submit-revision"
            >
              {reviseOfferMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
              ) : (
                "Update Price"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Bids Dialog */}
      <Dialog open={bidsDialogOpen} onOpenChange={(open) => { setBidsDialogOpen(open); if (!open) setViewingBidsForOffer(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Driver Offers
            </DialogTitle>
          </DialogHeader>
          {viewingBidsForOffer && (
            <div className="text-sm text-muted-foreground mb-2 p-2 bg-muted/50 rounded-lg">
              <p className="truncate"><strong>From:</strong> {viewingBidsForOffer.pickupLocation}</p>
              <p className="truncate"><strong>To:</strong> {viewingBidsForOffer.dropoffLocation}</p>
              <p><strong>Your offer:</strong> £{viewingBidsForOffer.offerPrice}</p>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {bidsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-2">Loading offers...</p>
              </div>
            ) : offerBids.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">No offers yet</p>
                <p className="text-xs text-muted-foreground">Drivers will see your request and can submit their offers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {offerBids.filter(bid => bid.status === 'pending').map((bid) => (
                  <div key={bid.id} className="p-3 border rounded-lg bg-card" data-testid={`bid-card-${bid.id}`}>
                    <div className="flex items-start gap-3">
                      <Link href={`/driver/${bid.driverId}`}>
                        <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary">
                          <AvatarImage src={bid.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${bid.driverId}`} />
                          <AvatarFallback>{bid.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Link href={`/driver/${bid.driverId}`} className="hover:underline">
                            <p className="font-medium text-sm" data-testid={`bid-driver-name-${bid.id}`}>
                              {bid.driver?.firstName || 'Driver'}
                            </p>
                          </Link>
                          <Badge className="bg-green-600 text-white text-sm font-bold" data-testid={`bid-price-${bid.id}`}>
                            £{bid.bidPrice}
                          </Badge>
                        </div>
                        {bid.driver?.driverRating && (
                          <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                            {parseFloat(bid.driver.driverRating).toFixed(1)}
                            {bid.driver.totalRatingsAsDriver && (
                              <span className="ml-1">({bid.driver.totalRatingsAsDriver} rides)</span>
                            )}
                          </div>
                        )}
                        {bid.driver?.vehicleMake && (
                          <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                            <Car className="h-3 w-3 mr-1" />
                            {bid.driver.vehicleMake} {bid.driver.vehicleModel}
                          </div>
                        )}
                        {bid.message && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{bid.message}"</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        className="flex-1 h-8"
                        onClick={() => acceptBidMutation.mutate(bid.id)}
                        disabled={acceptBidMutation.isPending}
                        data-testid={`button-accept-bid-${bid.id}`}
                      >
                        {acceptBidMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Accept Offer"
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
