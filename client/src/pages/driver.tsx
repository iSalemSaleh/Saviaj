import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock, Navigation, CheckCircle2, MessageSquare, Loader2, PoundSterling, CalendarDays, Calendar, Crosshair, Power, Radio } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";
import { DateTimePicker } from "@/components/DateTimePicker";
import { RiderLocationMap } from "@/components/map/RiderLocationMap";

type DetourUnit = "miles" | "km" | "meters" | "yards";

const UNIT_TO_MILES: Record<DetourUnit, number> = {
  miles: 1,
  km: 0.621371,
  meters: 0.000621371,
  yards: 0.000568182,
};

const UNIT_LABELS: Record<DetourUnit, string> = {
  miles: "Miles",
  km: "Kilometers",
  meters: "Meters",
  yards: "Yards",
};

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

function getDistanceAndETA(startLat: number, startLon: number, endLat: number, endLon: number): { distance: string; eta: string } {
  const distance = calculateDistance(startLat, startLon, endLat, endLon);
  const etaMinutes = Math.round((distance / 20) * 60);
  const etaText = etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`;
  
  if (distance < 1) {
    return { distance: `${Math.round(distance * 1760)} yards`, eta: etaText };
  }
  return { distance: `${distance.toFixed(1)} mi`, eta: etaText };
}

interface Ride {
  id: number;
  riderId: string;
  driverId: string;
  pickupLocation: string;
  dropoffLocation: string;
  agreedPrice: string;
  scheduledTime: string;
  status: string;
}

interface UserLocation {
  lat: number;
  lng: number;
}

export default function DriverPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const [startLocation, setStartLocation] = useState("");
  const [startCoords, setStartCoords] = useState<{lat: number; lon: number} | null>(null);
  const [endLocation, setEndLocation] = useState("");
  const [endCoords, setEndCoords] = useState<{lat: number; lon: number} | null>(null);
  const [departureTime, setDepartureTime] = useState("");
  const [maxDetour, setMaxDetour] = useState("");
  const [detourUnit, setDetourUnit] = useState<DetourUnit>("miles");
  const [availableSeats, setAvailableSeats] = useState("");
  const [pricePerSeat, setPricePerSeat] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const handleStartChange = (value: string, lat?: number, lon?: number) => {
    setStartLocation(value);
    if (lat !== undefined && lon !== undefined) {
      setStartCoords({ lat, lon });
    } else if (!value) {
      setStartCoords(null);
    }
  };

  const handleEndChange = (value: string, lat?: number, lon?: number) => {
    setEndLocation(value);
    if (lat !== undefined && lon !== undefined) {
      setEndCoords({ lat, lon });
    } else if (!value) {
      setEndCoords(null);
    }
  };

  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<RiderOffer | null>(null);
  const [bidPrice, setBidPrice] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [showFutureDates, setShowFutureDates] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Commercial driver online status
  const [isOnlineForHire, setIsOnlineForHire] = useState(false);
  const [ratePerMile, setRatePerMile] = useState("");
  const [isUpdatingOnlineStatus, setIsUpdatingOnlineStatus] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log("Geolocation error:", error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Initialize commercial driver online status from user data
  useEffect(() => {
    if (user?.isCommercialDriver) {
      setIsOnlineForHire(user.isOnlineForHire || false);
      if (user.ratePerMile) {
        setRatePerMile(user.ratePerMile);
      }
    }
  }, [user]);

  // Handle toggling online status for commercial drivers
  const handleToggleOnlineStatus = async () => {
    if (!user?.isCommercialDriver) return;
    
    const newOnlineStatus = !isOnlineForHire;
    
    // Require rate per mile when going online
    if (newOnlineStatus && (!ratePerMile || parseFloat(ratePerMile) <= 0)) {
      toast({
        title: "Rate Required",
        description: "Please set your rate per mile before going online.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUpdatingOnlineStatus(true);
    
    try {
      // Get current location when going online
      let lat: number | undefined;
      let lng: number | undefined;
      
      if (newOnlineStatus && navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }
      
      const response = await apiRequest("POST", "/api/driver/online-status", {
        isOnlineForHire: newOnlineStatus,
        ratePerMile: parseFloat(ratePerMile),
        lat,
        lng,
      });
      
      if (response.ok) {
        setIsOnlineForHire(newOnlineStatus);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: newOnlineStatus ? "You're Now Online" : "You're Now Offline",
          description: newOnlineStatus 
            ? "Riders can now see you and request rides." 
            : "You're no longer visible to riders.",
        });
      } else {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update online status.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingOnlineStatus(false);
    }
  };

  const getOfferDistanceAndETA = (offer: RiderOffer): { distance: string; eta: string } | null => {
    if (!userLocation || !offer.pickupLat || !offer.pickupLng) return null;
    return getDistanceAndETA(
      userLocation.lat,
      userLocation.lng,
      parseFloat(offer.pickupLat),
      parseFloat(offer.pickupLng)
    );
  };

  const useCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location services.",
        variant: "destructive",
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setStartCoords({ lat: latitude, lon: longitude });
        setUserLocation({ lat: latitude, lng: longitude });
        
        try {
          const response = await fetch(`/api/azure-maps/reverse-geocode?lat=${latitude}&lon=${longitude}`);
          if (response.ok) {
            const data = await response.json();
            setStartLocation(data.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          } else {
            setStartLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch {
          setStartLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setIsGettingLocation(false);
      },
      (error) => {
        setIsGettingLocation(false);
        toast({
          title: "Location Error",
          description: error.message || "Unable to get your current location.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [toast]);

  const { data: riderOffers = [], isLoading: offersLoading } = useQuery<RiderOffer[]>({
    queryKey: ["/api/rider-offers", "pending"],
    queryFn: async () => {
      const response = await fetch("/api/rider-offers?status=pending");
      return response.json();
    },
  });

  const filteredOffers = useMemo(() => {
    const now = new Date(currentTime);
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return riderOffers.filter(offer => {
      const requestedTime = new Date(offer.requestedTime);
      if (requestedTime < now) return false;
      if (!showFutureDates && requestedTime > twentyFourHoursLater) return false;
      return offer.status === "pending";
    });
  }, [riderOffers, showFutureDates, currentTime]);

  const detourDistanceInMiles = useMemo(() => {
    const value = parseFloat(maxDetour) || 2;
    return value * UNIT_TO_MILES[detourUnit];
  }, [maxDetour, detourUnit]);

  const nearbyOffers = (startCoords && endCoords) ? filteredOffers.filter(offer => {
    if (!offer.pickupLat || !offer.pickupLng || !offer.dropoffLat || !offer.dropoffLng) return false;
    const offerPickupLat = parseFloat(offer.pickupLat);
    const offerPickupLng = parseFloat(offer.pickupLng);
    const offerDropoffLat = parseFloat(offer.dropoffLat);
    const offerDropoffLng = parseFloat(offer.dropoffLng);
    const distanceToPickup = calculateDistance(startCoords.lat, startCoords.lon, offerPickupLat, offerPickupLng);
    const distanceToDropoff = calculateDistance(endCoords.lat, endCoords.lon, offerDropoffLat, offerDropoffLng);
    return distanceToPickup <= detourDistanceInMiles && distanceToDropoff <= detourDistanceInMiles;
  }) : [];

  const { data: myRides = [], isLoading: ridesLoading } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
    enabled: !!user,
  });

  const createRouteMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/driver-routes", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your route has been published!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-routes"] });
      setStartLocation("");
      setStartCoords(null);
      setEndLocation("");
      setEndCoords(null);
      setDepartureTime("");
      setMaxDetour("");
      setDetourUnit("miles");
      setAvailableSeats("");
      setPricePerSeat("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish route",
        variant: "destructive",
      });
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: async (offerId: number) => {
      const response = await apiRequest("PATCH", `/api/rider-offers/${offerId}/accept`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Ride Accepted!",
        description: "You've accepted the ride request.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept offer",
        variant: "destructive",
      });
    },
  });

  const createBidMutation = useMutation({
    mutationFn: async (data: { riderOfferId: number; bidPrice: number; message?: string }) => {
      const response = await apiRequest("POST", "/api/bids", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Bid Submitted!",
        description: "Your counter-offer has been sent to the rider.",
      });
      setBidDialogOpen(false);
      setBidPrice("");
      setBidMessage("");
      setSelectedOffer(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit bid",
        variant: "destructive",
      });
    },
  });

  const handlePublishRoute = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!startLocation || !endLocation || !departureTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const selectedTime = new Date(departureTime);
    if (selectedTime <= new Date()) {
      toast({
        title: "Invalid Time",
        description: "Please select a departure time in the future",
        variant: "destructive",
      });
      return;
    }

    const detour = parseFloat(maxDetour);
    if (isNaN(detour) || detour <= 0) {
      toast({
        title: "Invalid Detour",
        description: "Please enter a valid max detour distance",
        variant: "destructive",
      });
      return;
    }
    const detourInMiles = detour * UNIT_TO_MILES[detourUnit];
    if (detourInMiles < 0.01 || detourInMiles > 100) {
      toast({
        title: "Invalid Detour",
        description: "Max detour is too small or too large",
        variant: "destructive",
      });
      return;
    }

    const seats = parseInt(availableSeats);
    if (isNaN(seats) || seats < 1 || seats > 7) {
      toast({
        title: "Invalid Seats",
        description: "Please enter between 1 and 7 available seats",
        variant: "destructive",
      });
      return;
    }

    let price = null;
    if (pricePerSeat) {
      price = parseFloat(pricePerSeat);
      if (isNaN(price) || price < 1 || price > 100) {
        toast({
          title: "Invalid Price",
          description: "Please enter a price between £1 and £100 per seat",
          variant: "destructive",
        });
        return;
      }
    }

    createRouteMutation.mutate({
      startLocation,
      endLocation,
      departureTime: selectedTime.toISOString(),
      maxDetourMiles: detourInMiles,
      availableSeats: seats,
      pricePerSeat: price,
    });
  };

  const handleAcceptOffer = (offerId: number) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    acceptOfferMutation.mutate(offerId);
  };

  const handleBidSubmit = () => {
    if (!selectedOffer || !bidPrice) {
      toast({
        title: "Missing Price",
        description: "Please enter your counter-offer price",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(bidPrice);
    if (isNaN(price) || price < 1 || price > 500) {
      toast({
        title: "Invalid Price",
        description: "Please enter a price between £1 and £500",
        variant: "destructive",
      });
      return;
    }

    createBidMutation.mutate({
      riderOfferId: selectedOffer.id,
      bidPrice: price,
      message: bidMessage || undefined,
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

  const activeRides = myRides.filter(r => r.status === "scheduled" || r.status === "in_progress");
  const completedRides = myRides.filter(r => r.status === "completed");

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="grid lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Left Panel: Post Route */}
          <div className="lg:col-span-4 space-y-3">
            <div className="lg:sticky lg:top-20 space-y-3">
              {/* Commercial Driver Online Status Card */}
              {user?.isCommercialDriver && (
                <Card className={`border-none shadow-lg ${isOnlineForHire ? 'bg-gradient-to-r from-green-600 to-green-500' : 'bg-gradient-to-r from-slate-700 to-slate-600'} text-white`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Radio className={`h-4 w-4 ${isOnlineForHire ? 'animate-pulse' : 'opacity-60'}`} />
                        <span className="font-semibold text-sm">Pro Driver Status</span>
                      </div>
                      <Badge variant="secondary" className={isOnlineForHire ? 'bg-white/20 text-white border-white/30' : 'bg-white/10 text-white/80 border-white/20'}>
                        {isOnlineForHire ? 'ONLINE' : 'OFFLINE'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <PoundSterling className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          type="number"
                          step="0.01"
                          min="0.50"
                          max="10"
                          value={ratePerMile}
                          onChange={(e) => setRatePerMile(e.target.value)}
                          placeholder="Rate/mile"
                          className="pl-8 h-9 text-sm bg-white text-gray-900 border-none"
                          disabled={isOnlineForHire}
                          data-testid="input-rate-per-mile"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleToggleOnlineStatus}
                        disabled={isUpdatingOnlineStatus || (!user?.driverVerified && !user?.commercialStatusVerified)}
                        className={`h-9 px-4 ${isOnlineForHire 
                          ? 'bg-red-500 hover:bg-red-600' 
                          : 'bg-white text-green-700 hover:bg-green-50'}`}
                        data-testid="button-toggle-online"
                      >
                        {isUpdatingOnlineStatus ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Power className="h-4 w-4 mr-1" />
                            {isOnlineForHire ? 'Offline' : 'Online'}
                          </>
                        )}
                      </Button>
                    </div>
                    
                  </CardContent>
                </Card>
              )}
              
              <Card className="border-none shadow-md bg-primary text-primary-foreground">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg sm:text-xl text-white">Post Your Route</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={useCurrentLocation}
                      disabled={isGettingLocation}
                      className="h-6 text-[10px] text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/20 px-2"
                      data-testid="button-use-current-location"
                    >
                      {isGettingLocation ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Crosshair className="h-3 w-3 mr-1" />
                          <span>Current</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <form onSubmit={handlePublishRoute}>
                  <CardContent className="space-y-4 px-4 py-4">
                    <PostcodeSearch
                      value={startLocation}
                      onChange={handleStartChange}
                      placeholder="Starting point"
                      iconColor="text-primary"
                      inputClassName="bg-white text-primary border-none"
                      textClassName="text-primary-foreground/70"
                      testId="input-start-location"
                      isCurrentLocation={!!userLocation && startCoords?.lat === userLocation.lat && startCoords?.lon === userLocation.lng}
                      compact
                    />
                    
                    <PostcodeSearch
                      value={endLocation}
                      onChange={handleEndChange}
                      placeholder="Destination"
                      iconColor="text-primary"
                      inputClassName="bg-white text-primary border-none"
                      textClassName="text-primary-foreground/70"
                      testId="input-end-location"
                      compact
                    />

                    <div className="grid grid-cols-5 gap-2">
                      <DateTimePicker
                        value={departureTime}
                        onChange={setDepartureTime}
                        testId="input-departure-time"
                        className="col-span-3"
                        buttonClassName="bg-white text-primary border-none h-8"
                        compact
                      />
                      <div className="col-span-2 flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 bg-white text-primary border-none"
                          onClick={() => setPricePerSeat(String(Math.max(1, (parseInt(pricePerSeat) || 0) - 1)))}
                          data-testid="button-decrease-price"
                        >
                          -
                        </Button>
                        <div className="relative flex-1">
                          <PoundSterling className="absolute left-1.5 top-2 h-3 w-3 text-muted-foreground" />
                          <Input 
                            type="number" 
                            placeholder="price/seat"
                            min="1"
                            max="100"
                            step="1"
                            className="pl-5 h-8 text-xs bg-white text-primary border-none text-center"
                            value={pricePerSeat}
                            onChange={(e) => setPricePerSeat(e.target.value)}
                            aria-label="Price per seat in pounds"
                            data-testid="input-price-per-seat"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 bg-white text-primary border-none"
                          onClick={() => setPricePerSeat(String(Math.min(100, (parseInt(pricePerSeat) || 0) + 1)))}
                          data-testid="button-increase-price"
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 flex gap-1">
                        <Input 
                          type="number" 
                          placeholder="Detour"
                          min="1"
                          step="any"
                          className="h-8 text-sm bg-white text-primary border-none flex-1"
                          value={maxDetour}
                          onChange={(e) => setMaxDetour(e.target.value)}
                          aria-label="Maximum detour distance"
                          data-testid="input-max-detour"
                        />
                        <Select value={detourUnit} onValueChange={(v) => setDetourUnit(v as DetourUnit)}>
                          <SelectTrigger className="h-8 w-16 text-xs bg-white text-primary border-none" data-testid="select-detour-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(UNIT_LABELS) as DetourUnit[]).map((unit) => (
                              <SelectItem key={unit} value={unit}>{UNIT_LABELS[unit]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Select value={availableSeats} onValueChange={setAvailableSeats}>
                        <SelectTrigger className="h-8 text-sm bg-white text-primary border-none" data-testid="select-seats">
                          <SelectValue placeholder="Seats" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4].map((num) => (
                            <SelectItem key={num} value={String(num)}>{num} seat{num > 1 ? 's' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      type="submit"
                      variant="secondary" 
                      className="w-full h-10 text-sm font-semibold shadow-sm"
                      disabled={createRouteMutation.isPending}
                      data-testid="button-publish-route"
                    >
                      {createRouteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        "Publish Route"
                      )}
                    </Button>
                  </CardContent>
                </form>
              </Card>
            </div>
          </div>

          {/* Right Panel: Map & Rider Offers */}
          <div className="lg:col-span-8 space-y-4">
            {/* Map showing driver's route */}
            <div className="h-[200px] sm:h-[250px] rounded-lg overflow-hidden">
              <RiderLocationMap
                userLocation={startCoords ? { lat: startCoords.lat, lng: startCoords.lon } : userLocation}
                destination={endCoords ? { lat: endCoords.lat, lng: endCoords.lon } : undefined}
                nearbyDrivers={[]}
                showRoute={!!startCoords && !!endCoords}
              />
            </div>

            <Tabs defaultValue="offers" className="w-full">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg sm:text-xl font-bold text-primary">Dashboard</h2>
                <TabsList className="h-8">
                  <TabsTrigger value="offers" className="text-xs px-2">Offers</TabsTrigger>
                  <TabsTrigger value="active" className="text-xs px-2">Active ({activeRides.length})</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs px-2">History</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="offers" className="space-y-6">
                {/* Nearby Offers Section - shows when start location is set */}
                {startCoords && endCoords && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-xl font-bold text-accent flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Nearby Rider Offers
                        {nearbyOffers.length > 0 && (
                          <Badge className="bg-accent text-white">{nearbyOffers.length} found</Badge>
                        )}
                      </h3>
                    </div>
                    
                    {nearbyOffers.length === 0 ? (
                      <Card className="border-dashed border-accent/30 bg-accent/5 mb-6">
                        <CardContent className="p-6 text-center">
                          <MapPin className="h-10 w-10 text-accent/40 mx-auto mb-2" />
                          <p className="text-muted-foreground">No rider offers near your route yet.</p>
                          <p className="text-sm text-muted-foreground mt-1">Publish your route and riders will find you!</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4 mb-6">
                        {nearbyOffers.map((offer) => (
                          <Card key={offer.id} className="overflow-hidden hover:shadow-lg transition-shadow border-accent/30 bg-accent/5" data-testid={`card-nearby-offer-${offer.id}`}>
                            <div className="flex flex-col sm:flex-row">
                              <div className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-3">
                                    <Avatar>
                                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${offer.riderId}`} />
                                      <AvatarFallback>R</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold text-primary">Nearby Rider</p>
                                      <div className="flex items-center text-xs text-muted-foreground">
                                        <span className="text-yellow-500">★</span> 4.8 • {formatDate(offer.requestedTime)}
                                      </div>
                                    </div>
                                  </div>
                                  <Badge className="text-lg px-3 py-1 bg-accent text-white">
                                    £{offer.offerPrice}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-accent text-xs uppercase tracking-wider">Pickup</span>
                                    <p className="font-medium truncate">{offer.pickupLocation}</p>
                                  </div>
                                  <div>
                                    <span className="text-secondary text-xs uppercase tracking-wider">Dropoff</span>
                                    <p className="font-medium truncate">{offer.dropoffLocation}</p>
                                  </div>
                                </div>
                                {getOfferDistanceAndETA(offer) && (
                                  <div className="flex items-center gap-2 mt-3">
                                    <Badge variant="outline" className="text-xs">
                                      <Navigation className="h-3 w-3 mr-1" />
                                      {getOfferDistanceAndETA(offer)!.distance}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      ~{getOfferDistanceAndETA(offer)!.eta} away
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              <div className="bg-accent/10 p-4 sm:w-32 flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l">
                                <Button 
                                  className="w-full bg-accent hover:bg-accent/90"
                                  onClick={() => handleAcceptOffer(offer.id)}
                                  disabled={acceptOfferMutation.isPending}
                                  data-testid={`button-accept-nearby-${offer.id}`}
                                >
                                  <CheckCircle2 className="mr-1 h-4 w-4" /> Accept
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* All Offers Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-primary">
                      {startCoords && endCoords ? "All Rider Offers" : "Rider Offers"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="future-dates-driver"
                        checked={showFutureDates}
                        onCheckedChange={setShowFutureDates}
                        data-testid="switch-future-dates-driver"
                      />
                      <label htmlFor="future-dates-driver" className="text-sm flex items-center gap-1 cursor-pointer">
                        <CalendarDays className="h-4 w-4" />
                        Future dates
                      </label>
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
                      {filteredOffers.length} offers
                    </Badge>
                  </div>
                  
                  {offersLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Card key={i} className="animate-pulse">
                          <CardContent className="p-6">
                            <div className="h-24 bg-muted rounded" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : filteredOffers.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="p-12 text-center">
                        <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground">
                          {showFutureDates 
                            ? "No rider offers available at the moment."
                            : "No offers available in the next 24 hours."}
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
                        <p className="text-sm text-muted-foreground mt-2">Check back soon for new ride requests!</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {filteredOffers.map((offer) => (
                    <Card key={offer.id} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`card-offer-${offer.id}`}>
                      <div className="flex flex-col sm:flex-row">
                        <div className="p-6 flex-1">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${offer.riderId}`} />
                                <AvatarFallback>R</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-primary">Rider</p>
                                <div className="flex items-center text-xs text-muted-foreground">
                                  <span className="text-yellow-500">★</span> 4.8 • {formatDate(offer.requestedTime)}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="block text-2xl font-bold text-primary" data-testid={`text-price-${offer.id}`}>£{offer.offerPrice}</span>
                              <span className="text-xs text-muted-foreground">offered price</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground text-xs uppercase tracking-wider">Pickup</span>
                              <p className="font-medium truncate">{offer.pickupLocation}</p>
                              <p className="text-xs text-muted-foreground">{formatTime(offer.requestedTime)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs uppercase tracking-wider">Dropoff</span>
                              <p className="font-medium truncate">{offer.dropoffLocation}</p>
                            </div>
                          </div>
                          {getOfferDistanceAndETA(offer) && (
                            <div className="flex items-center gap-2 mt-3">
                              <Badge variant="outline" className="text-xs">
                                <Navigation className="h-3 w-3 mr-1" />
                                {getOfferDistanceAndETA(offer)!.distance}
                              </Badge>
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                ~{getOfferDistanceAndETA(offer)!.eta} away
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="bg-muted/30 p-4 sm:w-32 flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l">
                          <Button 
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => handleAcceptOffer(offer.id)}
                            disabled={acceptOfferMutation.isPending}
                            data-testid={`button-accept-${offer.id}`}
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" /> Accept
                          </Button>
                          <Dialog open={bidDialogOpen && selectedOffer?.id === offer.id} onOpenChange={(open) => {
                            setBidDialogOpen(open);
                            if (open) setSelectedOffer(offer);
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="w-full text-muted-foreground hover:text-primary" data-testid={`button-bid-${offer.id}`}>
                                <MessageSquare className="mr-1 h-4 w-4" /> Bid
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Counter Offer</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <p className="text-sm text-muted-foreground">
                                  The rider offered <strong>£{offer.offerPrice}</strong>. Enter your counter-offer:
                                </p>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Your Price (£)</label>
                                  <div className="relative">
                                    <PoundSterling className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                      type="number"
                                      placeholder="Enter your price"
                                      className="pl-9"
                                      value={bidPrice}
                                      onChange={(e) => setBidPrice(e.target.value)}
                                      data-testid="input-bid-price"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Message (Optional)</label>
                                  <Input 
                                    placeholder="e.g., I can pick up 5 mins earlier"
                                    value={bidMessage}
                                    onChange={(e) => setBidMessage(e.target.value)}
                                    data-testid="input-bid-message"
                                  />
                                </div>
                                <Button 
                                  onClick={handleBidSubmit}
                                  className="w-full"
                                  disabled={createBidMutation.isPending || !bidPrice}
                                  data-testid="button-submit-bid"
                                >
                                  {createBidMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Sending...
                                    </>
                                  ) : (
                                    "Send Counter Offer"
                                  )}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="active" className="space-y-4">
                {activeRides.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <div className="bg-muted rounded-full p-4 mb-4">
                      <Navigation className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-medium text-primary">No active rides</h3>
                    <p>Accept an offer to start a ride.</p>
                  </div>
                ) : (
                  activeRides.map((ride) => (
                    <Card key={ride.id} className="overflow-hidden" data-testid={`card-ride-${ride.id}`}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <Badge className={ride.status === 'in_progress' ? 'bg-green-500' : 'bg-blue-500'}>
                              {ride.status === 'in_progress' ? 'In Progress' : 'Scheduled'}
                            </Badge>
                            <p className="font-medium mt-2">{ride.pickupLocation} → {ride.dropoffLocation}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(ride.scheduledTime)} at {formatTime(ride.scheduledTime)}</p>
                          </div>
                          <span className="text-xl font-bold text-primary">£{ride.agreedPrice}</span>
                        </div>
                        <Button 
                          onClick={() => navigate(`/ride/${ride.id}`)}
                          className="w-full"
                          data-testid={`button-track-${ride.id}`}
                        >
                          Track Ride
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                {completedRides.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-12 text-center">
                      <p className="text-muted-foreground">No completed rides yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  completedRides.map((ride) => (
                    <Card key={ride.id} className="opacity-75" data-testid={`card-history-${ride.id}`}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{ride.pickupLocation} → {ride.dropoffLocation}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(ride.scheduledTime)}</p>
                          </div>
                          <span className="text-lg font-bold text-primary">£{ride.agreedPrice}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
          
        </div>
      </div>
    </div>
  );
}
