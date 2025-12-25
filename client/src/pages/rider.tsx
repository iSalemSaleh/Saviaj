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
import { MapPin, Clock, PoundSterling, Calendar, ArrowRight, Loader2, Navigation, CalendarDays, Users, Edit2, X, Star, Shield, Car, Radio, Crown, ChevronDown, ChevronUp } from "lucide-react";
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
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [requestingDriverId, setRequestingDriverId] = useState<string | null>(null);
  const [routesExpanded, setRoutesExpanded] = useState(false);
  const [driversExpanded, setDriversExpanded] = useState(false);
  const [allRoutesExpanded, setAllRoutesExpanded] = useState(false);
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
    queryKey: ["/api/driver-routes", pickupCoords?.lat, pickupCoords?.lon],
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
  });

  const { data: myOffers = [], isLoading: myOffersLoading } = useQuery<RiderOffer[]>({
    queryKey: ["/api/rider-offers/mine"],
    queryFn: async () => {
      const response = await fetch("/api/rider-offers/mine");
      return response.json();
    },
    enabled: !!user,
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
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Fixed Navbar */}
      <div className="flex-shrink-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <Navbar />
      </div>
      
      {/* TOP: Request Form - compact, fixed height */}
      <div className="flex-shrink-0 z-20 px-3 py-3 bg-background/95 border-b border-border">
        <form onSubmit={handleSubmit} className="space-y-2">
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
              className="flex-1"
              compact
            />
            <div className="relative w-24">
              <PoundSterling className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                type="number" 
                placeholder="Offer"
                min="1"
                max="500"
                step="1"
                className="pl-7 h-8 text-sm"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                aria-label="Price offer in pounds"
                data-testid="input-price"
              />
            </div>
            <Button 
              type="submit" 
              className="h-8 px-4 text-sm"
              disabled={createOfferMutation.isPending}
              data-testid="button-post-request"
            >
              {createOfferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
            </Button>
          </div>
        </form>
      </div>

      {/* MIDDLE: Map Section - takes remaining space */}
      <div className="flex-1 relative min-h-0">
        <RiderLocationMap
          userLocation={userLocation}
          destination={dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lon } : undefined}
          nearbyDrivers={nearbyDrivers}
          showRoute={!!dropoffCoords}
          onRouteInfo={(distance, duration) => setRouteInfo({ distance, duration })}
        />
        
        {/* My Pending Offers - floating badge on map */}
        {user && myPendingOffers.length > 0 && (
          <div className="absolute top-2 right-2 z-10">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary" className="shadow-lg">
                  <Badge className="bg-primary text-white mr-2">{myPendingOffers.length}</Badge>
                  My Requests
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>My Pending Requests</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {myPendingOffers.map((offer) => (
                    <div key={offer.id} className="p-3 bg-muted/50 rounded-lg border" data-testid={`my-offer-${offer.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{offer.pickupLocation}</p>
                          <p className="text-xs text-muted-foreground">to</p>
                          <p className="text-sm font-medium truncate">{offer.dropoffLocation}</p>
                        </div>
                        <Badge className="bg-primary text-white shrink-0">£{offer.offerPrice}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(offer.requestedTime)} at {formatTime(offer.requestedTime)}
                        </p>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2"
                            onClick={() => {
                              setSelectedOffer(offer);
                              setEditPrice(offer.offerPrice);
                              setEditDialogOpen(true);
                            }}
                            data-testid={`button-edit-offer-${offer.id}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => cancelOfferMutation.mutate(offer.id)}
                            disabled={cancelOfferMutation.isPending}
                            data-testid={`button-cancel-offer-${offer.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* BOTTOM: Nearby Drivers Panel - compact, scrollable */}
      <div className="flex-shrink-0 z-20 bg-background border-t border-border max-h-[35vh] overflow-y-auto">
        {/* Tab-like header */}
        <div className="sticky top-0 bg-background border-b border-border px-3 py-2 flex items-center gap-4">
          <button
            className={`text-sm font-medium flex items-center gap-1 pb-1 ${!allRoutesExpanded ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
            onClick={() => setAllRoutesExpanded(false)}
          >
            <Crown className="h-4 w-4" />
            Pro Drivers
            {nearbyDrivers.length > 0 && <Badge className="bg-primary text-white text-xs ml-1">{nearbyDrivers.length}</Badge>}
          </button>
          <button
            className={`text-sm font-medium flex items-center gap-1 pb-1 ${allRoutesExpanded ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
            onClick={() => setAllRoutesExpanded(true)}
          >
            <MapPin className="h-4 w-4" />
            Routes
            {filteredAndSortedRoutes.length > 0 && <Badge variant="outline" className="text-xs ml-1">{filteredAndSortedRoutes.length}</Badge>}
          </button>
        </div>

        {/* Pro Drivers Tab */}
        {!allRoutesExpanded && (
          <div className="p-3">
            {nearbyDriversLoading ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 text-primary mx-auto animate-spin" />
                <p className="text-xs text-muted-foreground mt-1">Finding drivers...</p>
              </div>
            ) : nearbyDrivers.length === 0 ? (
              <div className="text-center py-4">
                <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground mt-1">No Pro drivers nearby</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {nearbyDrivers.slice(0, 10).map((driver) => {
                  const estimatedCost = getEstimatedCost(driver);
                  return (
                    <div key={driver.id} className="flex-shrink-0 w-40 p-3 bg-muted/50 rounded-lg border" data-testid={`card-pro-driver-${driver.id}`}>
                      <Link href={`/driver/${driver.id}`} className="block" data-testid={`link-pro-driver-${driver.id}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="relative">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={driver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.id}`} />
                              <AvatarFallback>{driver.firstName?.charAt(0) || 'D'}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
                              <Radio className="h-2 w-2 text-white" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate text-primary" data-testid={`text-pro-driver-name-${driver.id}`}>
                              {driver.firstName || 'Driver'}
                            </p>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500 mr-0.5" />
                              {driver.driverRating ? parseFloat(driver.driverRating).toFixed(1) : 'New'}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          £{driver.ratePerMile}/mi • {driver.distanceFromPickup.toFixed(1)} mi
                        </div>
                        {estimatedCost && <p className="text-sm font-bold text-primary">Est. £{estimatedCost}</p>}
                      </Link>
                      <Button 
                        size="sm" 
                        className="w-full h-7 mt-2 text-xs"
                        onClick={() => handleRequestProDriver(driver)}
                        disabled={requestingDriverId === driver.id || !dropoffCoords}
                        data-testid={`button-request-pro-driver-${driver.id}`}
                      >
                        {requestingDriverId === driver.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Request'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Routes Tab */}
        {allRoutesExpanded && (
          <div className="p-3">
            {routesLoading ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 text-primary mx-auto animate-spin" />
              </div>
            ) : filteredAndSortedRoutes.length === 0 ? (
              <div className="text-center py-4">
                <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground mt-1">No routes available</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {filteredAndSortedRoutes.slice(0, 10).map((route) => (
                  <div key={route.id} className="flex-shrink-0 w-48 p-3 bg-muted/50 rounded-lg border" data-testid={`card-route-${route.id}`}>
                    <Link href={`/driver/${route.driverId}`} className="block" data-testid={`link-driver-profile-${route.id}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                          <AvatarFallback>{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate text-primary" data-testid={`text-driver-name-route-${route.id}`}>
                            {route.driver?.firstName || 'Driver'}
                          </p>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500 mr-0.5" />
                            {route.driver?.driverRating ? parseFloat(route.driver.driverRating).toFixed(1) : 'New'}
                          </div>
                        </div>
                        {route.pricePerSeat && <Badge className="bg-primary text-white text-xs">£{route.pricePerSeat}</Badge>}
                      </div>
                      <div className="text-xs space-y-0.5 mb-2">
                        <p className="truncate"><span className="text-primary">●</span> {route.startLocation}</p>
                        <p className="truncate"><span className="text-secondary">●</span> {route.endLocation}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-2.5 w-2.5 mr-1" />
                        {getTimeUntilDeparture(route.departureTime)}
                      </Badge>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
    </div>
  );
}
