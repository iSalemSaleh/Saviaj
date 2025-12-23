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
import { MapPin, Clock, PoundSterling, Calendar, ArrowRight, Loader2, Navigation, CalendarDays, Users, Edit2, X, Star, Shield, Car, Radio, Crown } from "lucide-react";
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
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="grid lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Left Panel: Compact Request Form */}
          <div className="lg:col-span-4 space-y-3">
            <div className="lg:sticky lg:top-20">
              <Card className="border-none shadow-md">
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4 px-4 py-4">
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

                    <div className="grid grid-cols-3 gap-3">
                      <DateTimePicker
                        value={requestedTime}
                        onChange={setRequestedTime}
                        testId="input-time"
                        className="col-span-2"
                        compact
                      />
                      <div className="relative">
                        <PoundSterling className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                          type="number" 
                          placeholder="Your offer"
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
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full h-10 text-sm shadow-sm"
                      disabled={createOfferMutation.isPending}
                      data-testid="button-post-request"
                    >
                      {createOfferMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        "Post Request"
                      )}
                    </Button>
                  </CardContent>
                </form>
              </Card>

              {/* My Pending Offers Section */}
              {user && myPendingOffers.length > 0 && (
                <Card className="mt-6 border-none shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>My Pending Requests</span>
                      <Badge variant="outline">{myPendingOffers.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {myPendingOffers.map((offer) => (
                      <div 
                        key={offer.id} 
                        className="p-3 bg-muted/50 rounded-lg border"
                        data-testid={`my-offer-${offer.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{offer.pickupLocation}</p>
                            <p className="text-xs text-muted-foreground">to</p>
                            <p className="text-sm font-medium truncate">{offer.dropoffLocation}</p>
                          </div>
                          <Badge className="bg-primary text-white shrink-0">
                            £{offer.offerPrice}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(offer.requestedTime)} at {formatTime(offer.requestedTime)}
                          </p>
                          <div className="flex gap-1">
                            <Dialog open={editDialogOpen && selectedOffer?.id === offer.id} onOpenChange={(open) => {
                              setEditDialogOpen(open);
                              if (open) {
                                setSelectedOffer(offer);
                                setEditPrice(offer.offerPrice);
                              } else {
                                setSelectedOffer(null);
                                setEditPrice("");
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 px-2"
                                  data-testid={`button-edit-offer-${offer.id}`}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Revise Offer Price</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                  <p className="text-sm text-muted-foreground">
                                    Current price: <strong>£{offer.offerPrice}</strong>
                                  </p>
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
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Updating...
                                      </>
                                    ) : (
                                      "Update Price"
                                    )}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
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
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Right Panel: Map & Available Routes */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Interactive Map showing user location, nearby drivers, and route */}
            <div className="h-[200px] sm:h-[280px] rounded-lg overflow-hidden">
              <RiderLocationMap
                userLocation={userLocation}
                destination={dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lon } : undefined}
                nearbyDrivers={nearbyDrivers}
                showRoute={!!dropoffCoords}
                onRouteInfo={(distance, duration) => setRouteInfo({ distance, duration })}
              />
            </div>
            
            {/* Nearby Routes Section - shows when pickup is set */}
            {pickupCoords && dropoffCoords && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-accent flex items-center gap-2">
                    <MapPin className="h-6 w-6" />
                    Nearby Driver Routes
                    {nearbyRoutes.length > 0 && (
                      <Badge className="bg-accent text-white">{nearbyRoutes.length} found</Badge>
                    )}
                  </h2>
                </div>
                
                {nearbyRoutes.length === 0 ? (
                  <Card className="border-dashed border-accent/30 bg-accent/5">
                    <CardContent className="p-8 text-center">
                      <MapPin className="h-12 w-12 text-accent/40 mx-auto mb-3" />
                      <p className="text-muted-foreground">No driver routes near your location yet.</p>
                      <p className="text-sm text-muted-foreground mt-1">Post your request and drivers will see it!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {nearbyRoutes.map((route) => (
                      <Card key={route.id} className="group hover:border-accent transition-all hover:shadow-lg cursor-pointer border-accent/30 bg-accent/5" data-testid={`card-nearby-route-${route.id}`}>
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <Link href={`/driver/${route.driverId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-testid={`link-driver-profile-nearby-${route.id}`}>
                              <Avatar>
                                <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                                <AvatarFallback>{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-semibold text-primary" data-testid={`text-driver-name-${route.id}`}>
                                    {route.driver?.firstName || 'Driver'}{route.driver?.lastName ? ` ${route.driver.lastName.charAt(0)}.` : ''}
                                  </p>
                                  {route.driver?.driverVerified && (
                                    <Shield className="h-3.5 w-3.5 text-green-500" />
                                  )}
                                </div>
                                <div className="flex items-center text-xs text-muted-foreground gap-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                  <span>{route.driver?.driverRating ? parseFloat(route.driver.driverRating).toFixed(1) : 'New'}</span>
                                  <span>•</span>
                                  <span>{route.availableSeats} seats</span>
                                </div>
                                {route.driver?.vehicleMake && (
                                  <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                                    <Car className="h-3 w-3 mr-1" />
                                    {route.driver.vehicleColor && <span className="capitalize">{route.driver.vehicleColor} </span>}
                                    {route.driver.vehicleMake} {route.driver.vehicleModel}
                                  </div>
                                )}
                              </div>
                            </Link>
                            {route.pricePerSeat && (
                              <Badge variant="secondary" className="text-lg px-3 py-1 bg-accent text-white">
                                £{route.pricePerSeat}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm"><span className="text-accent">●</span> {route.startLocation}</p>
                            <p className="text-sm"><span className="text-secondary">●</span> {route.endLocation}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {getTimeUntilDeparture(route.departureTime)}
                              </Badge>
                              {getConfirmedRiders(route) > 0 && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  <Users className="h-3 w-3 mr-1" />
                                  {getConfirmedRiders(route)} rider{getConfirmedRiders(route) > 1 ? 's' : ''} confirmed
                                </Badge>
                              )}
                              {getDistanceAndETA(route) && (
                                <>
                                  <Badge variant="outline" className="text-xs">
                                    <Navigation className="h-3 w-3 mr-1" />
                                    {getDistanceAndETA(route)!.distance}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    ~{getDistanceAndETA(route)!.eta} away
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="bg-accent/10 p-3 flex justify-end">
                          <Button size="sm" className="bg-accent hover:bg-accent/90">
                            Request Seat <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nearby Drivers Section - shows when pickup is set */}
            {pickupCoords && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-green-600 flex items-center gap-2">
                    <Crown className="h-6 w-6" />
                    Nearby Drivers
                    {nearbyDrivers.length > 0 && (
                      <Badge className="bg-green-600 text-white">{nearbyDrivers.length} online</Badge>
                    )}
                  </h2>
                </div>
                
                {nearbyDriversLoading ? (
                  <Card className="border-dashed border-green-500/30 bg-green-50">
                    <CardContent className="p-8 text-center">
                      <Loader2 className="h-8 w-8 text-green-500 mx-auto mb-3 animate-spin" />
                      <p className="text-muted-foreground">Finding nearby drivers...</p>
                    </CardContent>
                  </Card>
                ) : nearbyDrivers.length === 0 ? (
                  <Card className="border-dashed border-green-500/30 bg-green-50">
                    <CardContent className="p-8 text-center">
                      <Radio className="h-12 w-12 text-green-500/40 mx-auto mb-3" />
                      <p className="text-muted-foreground">No drivers near you right now.</p>
                      <p className="text-sm text-muted-foreground mt-1">Try posting your route or checking driver routes.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {nearbyDrivers.map((driver) => {
                      const estimatedCost = getEstimatedCost(driver);
                      return (
                        <Card key={driver.id} className="group hover:border-green-500 transition-all hover:shadow-lg border-green-500/30 bg-green-50" data-testid={`card-pro-driver-${driver.id}`}>
                          <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                              <Link href={`/driver/${driver.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-testid={`link-pro-driver-${driver.id}`}>
                                <div className="relative">
                                  <Avatar>
                                    <AvatarImage src={driver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.id}`} />
                                    <AvatarFallback>{driver.firstName?.charAt(0) || 'D'}</AvatarFallback>
                                  </Avatar>
                                  <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5">
                                    <Radio className="h-3 w-3 text-white animate-pulse" />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-primary" data-testid={`text-pro-driver-name-${driver.id}`}>
                                      {driver.firstName || 'Driver'}{driver.lastName ? ` ${driver.lastName.charAt(0)}.` : ''}
                                    </p>
                                    <Crown className="h-3.5 w-3.5 text-green-500" />
                                  </div>
                                  <div className="flex items-center text-xs text-muted-foreground gap-1">
                                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                    <span>{driver.driverRating ? parseFloat(driver.driverRating).toFixed(1) : 'New'}</span>
                                    {driver.totalRatingsAsDriver && driver.totalRatingsAsDriver > 0 && (
                                      <>
                                        <span>•</span>
                                        <span>{driver.totalRatingsAsDriver} reviews</span>
                                      </>
                                    )}
                                  </div>
                                  {driver.vehicleMake && (
                                    <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                                      <Car className="h-3 w-3 mr-1" />
                                      {driver.vehicleColor && <span className="capitalize">{driver.vehicleColor} </span>}
                                      {driver.vehicleMake} {driver.vehicleModel}
                                    </div>
                                  )}
                                </div>
                              </Link>
                              <div className="text-right">
                                <Badge variant="secondary" className="text-lg px-3 py-1 bg-green-600 text-white mb-1">
                                  £{driver.ratePerMile}/mi
                                </Badge>
                                <p className="text-xs text-muted-foreground">{driver.distanceFromPickup.toFixed(1)} mi away</p>
                              </div>
                            </div>
                            
                            {driver.driverTagline && (
                              <p className="text-sm text-muted-foreground italic mb-3" data-testid={`text-pro-driver-tagline-${driver.id}`}>
                                "{driver.driverTagline}"
                              </p>
                            )}
                            
                            {estimatedCost && dropoffCoords && (
                              <div className="bg-white rounded-lg p-3 border border-green-200">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">Estimated Trip Cost</span>
                                  <span className="text-xl font-bold text-green-600">£{estimatedCost}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Based on {(calculateDistance(pickupCoords.lat, pickupCoords.lon, dropoffCoords.lat, dropoffCoords.lon)).toFixed(1)} mi at £{driver.ratePerMile}/mi
                                </p>
                              </div>
                            )}
                            
                            {!dropoffCoords && (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                Enter your destination to see the estimated cost
                              </p>
                            )}
                          </CardContent>
                          <CardFooter className="bg-green-100 p-3 flex justify-end">
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleRequestProDriver(driver)}
                              disabled={requestingDriverId === driver.id || !dropoffCoords}
                              data-testid={`button-request-pro-driver-${driver.id}`}
                            >
                              {requestingDriverId === driver.id ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Requesting...</>
                              ) : (
                                <>Request Ride <ArrowRight className="ml-2 h-4 w-4" /></>
                              )}
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* All Available Routes */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-primary">
                    Available Routes
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="future-dates"
                      checked={showFutureDates}
                      onCheckedChange={setShowFutureDates}
                      data-testid="switch-future-dates"
                    />
                    <label htmlFor="future-dates" className="text-sm flex items-center gap-1 cursor-pointer">
                      <CalendarDays className="h-4 w-4" />
                      Future dates
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Badge variant={!showFutureDates ? "default" : "outline"}>
                  Next 24 hours
                </Badge>
                {showFutureDates && (
                  <Badge variant="secondary">
                    + Future dates
                  </Badge>
                )}
                <Badge variant="outline" className="ml-auto">
                  {filteredAndSortedRoutes.length} routes
                </Badge>
              </div>

              {routesLoading ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-20 bg-muted rounded" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredAndSortedRoutes.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {showFutureDates 
                        ? "No driver routes available at the moment."
                        : "No routes available in the next 24 hours."}
                    </p>
                    {!showFutureDates && (
                      <Button 
                        variant="link" 
                        onClick={() => setShowFutureDates(true)}
                        className="mt-2"
                      >
                        Future dates
                      </Button>
                    )}
                    <p className="text-sm text-muted-foreground mt-2">Post a request and wait for drivers to respond!</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredAndSortedRoutes.map((route) => (
                  <Card key={route.id} className="group hover:border-primary/50 transition-all hover:shadow-md cursor-pointer" data-testid={`card-route-${route.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <Link href={`/driver/${route.driverId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-testid={`link-driver-profile-${route.id}`}>
                          <Avatar>
                            <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                            <AvatarFallback>{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-primary" data-testid={`text-driver-name-route-${route.id}`}>
                                {route.driver?.firstName || 'Driver'}{route.driver?.lastName ? ` ${route.driver.lastName.charAt(0)}.` : ''}
                              </p>
                              {route.driver?.driverVerified && (
                                <Shield className="h-3.5 w-3.5 text-green-500" />
                              )}
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground gap-1">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span>{route.driver?.driverRating ? parseFloat(route.driver.driverRating).toFixed(1) : 'New'}</span>
                              <span>•</span>
                              <span>{route.availableSeats} seats left</span>
                            </div>
                            {route.driver?.vehicleMake && (
                              <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                                <Car className="h-3 w-3 mr-1" />
                                {route.driver.vehicleColor && <span className="capitalize">{route.driver.vehicleColor} </span>}
                                {route.driver.vehicleMake} {route.driver.vehicleModel}
                              </div>
                            )}
                          </div>
                        </Link>
                        {route.pricePerSeat && (
                          <Badge variant="secondary" className="text-lg px-3 py-1 bg-primary/10 text-primary">
                            £{route.pricePerSeat}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-3 relative">
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border -z-10" />
                        
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 rounded-full border-2 border-primary bg-background z-10" />
                          <div>
                            <p className="text-sm font-medium">{route.startLocation}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(route.departureTime)} at {formatTime(route.departureTime)}</p>
                          </div>
                        </div>
                        
                        {getConfirmedRiders(route) > 0 && (
                          <div className="flex items-center gap-3 pl-1">
                            <div className="h-2 w-2 rounded-full bg-green-500 z-10" />
                            <p className="text-xs text-green-600 dark:text-green-400">
                              {getConfirmedRiders(route)} stop{getConfirmedRiders(route) > 1 ? 's' : ''} on this route
                            </p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 rounded-full border-2 border-secondary bg-background z-10" />
                          <div>
                            <p className="text-sm font-medium">{route.endLocation}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {getTimeUntilDeparture(route.departureTime)}
                        </Badge>
                        {getConfirmedRiders(route) > 0 && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <Users className="h-3 w-3 mr-1" />
                            {getConfirmedRiders(route)} confirmed
                          </Badge>
                        )}
                        {getDistanceAndETA(route) && (
                          <>
                            <Badge variant="outline" className="text-xs">
                              <Navigation className="h-3 w-3 mr-1" />
                              {getDistanceAndETA(route)!.distance}
                            </Badge>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              ~{getDistanceAndETA(route)!.eta} away
                            </Badge>
                          </>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="bg-muted/10 p-3 flex justify-end">
                      <Button size="sm" variant="ghost" className="group-hover:text-primary group-hover:bg-primary/5">
                        View Route <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
