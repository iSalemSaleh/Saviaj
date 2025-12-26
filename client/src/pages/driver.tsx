import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock, Navigation, CheckCircle2, MessageSquare, Loader2, PoundSterling, Crosshair, Power, Radio, Bell, Check, X, ChevronDown, ChevronUp, Route, Users, History, Settings } from "lucide-react";
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
  miles: "Mi",
  km: "Km",
  meters: "M",
  yards: "Yd",
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

const ITEMS_PER_PAGE = 10;

export default function DriverPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [centerTrigger, setCenterTrigger] = useState(0);

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

  const [formExpanded, setFormExpanded] = useState(true);
  const [offersCardOpen, setOffersCardOpen] = useState(false);
  const [activeRidesCardOpen, setActiveRidesCardOpen] = useState(false);
  const [historyCardOpen, setHistoryCardOpen] = useState(false);
  const [offersPage, setOffersPage] = useState(0);

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
  
  const [isOnlineForHire, setIsOnlineForHire] = useState(false);
  const [ratePerMile, setRatePerMile] = useState("");
  const [driverTagline, setDriverTagline] = useState("");
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

  useEffect(() => {
    if (user?.isCommercialDriver) {
      setIsOnlineForHire(user.isOnlineForHire || false);
      if (user.ratePerMile) {
        setRatePerMile(user.ratePerMile);
      }
      if (user.driverTagline) {
        setDriverTagline(user.driverTagline);
      }
    }
  }, [user]);

  const handleToggleOnlineStatus = async () => {
    if (!user?.isCommercialDriver) {
      toast({
        title: "Error",
        description: "Only commercial drivers can go online.",
        variant: "destructive",
      });
      return;
    }
    
    const newOnlineStatus = !isOnlineForHire;
    
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
      let lat: number | undefined;
      let lng: number | undefined;
      
      if (newOnlineStatus && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoError) {
          console.log("Geolocation unavailable, proceeding without location:", geoError);
        }
      }
      
      const response = await apiRequest("POST", "/api/driver/online-status", {
        isOnlineForHire: newOnlineStatus,
        ratePerMile: parseFloat(ratePerMile),
        driverTagline: driverTagline.trim(),
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
    refetchInterval: 15000,
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

  const displayOffers = startCoords && endCoords ? nearbyOffers : filteredOffers;
  const paginatedOffers = displayOffers.slice(offersPage * ITEMS_PER_PAGE, (offersPage + 1) * ITEMS_PER_PAGE);

  const { data: myRides = [], isLoading: ridesLoading } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: pendingRequests = [], isLoading: pendingRequestsLoading } = useQuery<Ride[]>({
    queryKey: ["/api/pro-driver/pending-requests"],
    enabled: !!user?.isCommercialDriver && isOnlineForHire,
    refetchInterval: 10000,
  });

  const respondToRequestMutation = useMutation({
    mutationFn: async ({ rideId, action }: { rideId: number; action: 'accept' | 'decline' }) => {
      const response = await apiRequest("PATCH", `/api/pro-driver/respond-to-request/${rideId}`, { action });
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.action === 'accept' ? "Ride Accepted!" : "Ride Declined",
        description: variables.action === 'accept' 
          ? "You've accepted the ride. The rider will be notified." 
          : "You've declined the ride request.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pro-driver/pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      if (variables.action === 'accept') {
        navigate(`/ride/${data.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to respond to request",
        variant: "destructive",
      });
    },
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
      setFormExpanded(false);
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

  const handleRecenter = () => {
    setCenterTrigger(prev => prev + 1);
  };

  const handleCardToggle = (card: 'offers' | 'active' | 'history') => {
    if (card === 'offers') {
      setOffersCardOpen(!offersCardOpen);
      setActiveRidesCardOpen(false);
      setHistoryCardOpen(false);
    } else if (card === 'active') {
      setActiveRidesCardOpen(!activeRidesCardOpen);
      setOffersCardOpen(false);
      setHistoryCardOpen(false);
    } else {
      setHistoryCardOpen(!historyCardOpen);
      setOffersCardOpen(false);
      setActiveRidesCardOpen(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <div className="fixed inset-0 z-0">
        <RiderLocationMap
          userLocation={startCoords ? { lat: startCoords.lat, lng: startCoords.lon } : userLocation}
          destination={endCoords ? { lat: endCoords.lat, lng: endCoords.lon } : undefined}
          nearbyDrivers={[]}
          showRoute={!!startCoords && !!endCoords}
          centerTrigger={centerTrigger}
        />
      </div>

      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar />
      </div>

      {pendingRequests.length > 0 && (
        <div className="fixed top-11 right-2 z-40 w-64 sm:w-72">
          <div className="bg-amber-500/95 backdrop-blur-md rounded-xl shadow-lg border border-amber-400 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 animate-bounce text-white" />
              <span className="text-sm font-semibold text-white">Incoming Requests</span>
              <Badge className="bg-white/20 text-white text-xs">{pendingRequests.length}</Badge>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingRequests.slice(0, 3).map((request) => (
                <div key={request.id} className="bg-white/10 rounded-lg p-2" data-testid={`pending-request-${request.id}`}>
                  <div className="flex items-start gap-2 text-xs text-white mb-1">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{request.pickupLocation}</p>
                      <p className="text-white/70 truncate">→ {request.dropoffLocation}</p>
                    </div>
                    <Badge className="bg-white text-amber-600 font-bold text-xs">£{request.agreedPrice}</Badge>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 bg-red-500/80 hover:bg-red-600 text-white"
                      onClick={() => respondToRequestMutation.mutate({ rideId: request.id, action: 'decline' })}
                      disabled={respondToRequestMutation.isPending}
                      data-testid={`button-decline-request-${request.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => respondToRequestMutation.mutate({ rideId: request.id, action: 'accept' })}
                      disabled={respondToRequestMutation.isPending}
                      data-testid={`button-accept-request-${request.id}`}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-11 left-2 right-2 sm:right-auto sm:w-72 z-40">
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-lg shadow-lg border border-white/20">
          <div 
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => setFormExpanded(!formExpanded)}
          >
            <div className="flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">Post Your Route</span>
            </div>
            <div className="flex items-center gap-1">
              {user?.isCommercialDriver && (
                <>
                  <div 
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      isOnlineForHire ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'
                    }`}
                    onClick={(e) => { e.stopPropagation(); handleToggleOnlineStatus(); }}
                  >
                    <Radio className={`h-2.5 w-2.5 ${isOnlineForHire ? 'animate-pulse' : ''}`} />
                    {isOnlineForHire ? 'ON' : 'OFF'}
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="button-pro-settings"
                      >
                        <Settings className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xs">
                      <DialogHeader>
                        <DialogTitle className="text-sm">Pro Driver Settings</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Rate per mile (£)</label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="10"
                            value={ratePerMile}
                            onChange={(e) => setRatePerMile(e.target.value)}
                            className="h-8 text-sm"
                            placeholder="e.g. 1.50"
                            data-testid="input-rate-per-mile"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Tagline</label>
                          <Input
                            value={driverTagline}
                            onChange={(e) => setDriverTagline(e.target.value)}
                            className="h-8 text-sm"
                            placeholder="e.g. Safe & reliable driver"
                            maxLength={50}
                            data-testid="input-driver-tagline"
                          />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {formExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>

          {!formExpanded && (startLocation || endLocation) && (
            <div className="px-2 pb-1.5">
              <div className="flex gap-1 text-[10px]">
                <div className="flex-1 truncate bg-muted/50 rounded px-1.5 py-0.5">
                  <span className="text-muted-foreground">From: </span>
                  <span className="font-medium">{startLocation || 'Not set'}</span>
                </div>
                <div className="flex-1 truncate bg-muted/50 rounded px-1.5 py-0.5">
                  <span className="text-muted-foreground">To: </span>
                  <span className="font-medium">{endLocation || 'Not set'}</span>
                </div>
              </div>
            </div>
          )}

          {formExpanded && (
            <form onSubmit={handlePublishRoute} className="px-2 pb-2 space-y-1.5">
              <PostcodeSearch
                value={startLocation}
                onChange={handleStartChange}
                placeholder="Starting point"
                iconColor="text-primary"
                inputClassName="bg-white dark:bg-slate-900 border-slate-200 h-7 text-xs"
                textClassName="text-muted-foreground"
                testId="input-start-location"
                isCurrentLocation={!!userLocation && startCoords?.lat === userLocation.lat && startCoords?.lon === userLocation.lng}
                compact
              />
              
              <PostcodeSearch
                value={endLocation}
                onChange={handleEndChange}
                placeholder="Destination"
                iconColor="text-primary"
                inputClassName="bg-white dark:bg-slate-900 border-slate-200 h-7 text-xs"
                textClassName="text-muted-foreground"
                testId="input-end-location"
                compact
              />

              <div className="grid grid-cols-3 gap-1.5">
                <DateTimePicker
                  value={departureTime}
                  onChange={setDepartureTime}
                  testId="input-departure-time"
                  buttonClassName="bg-white dark:bg-slate-900 border-slate-200 h-7 text-xs"
                  compact
                />
                <Select value={availableSeats} onValueChange={setAvailableSeats}>
                  <SelectTrigger className="h-7 text-xs bg-white dark:bg-slate-900 border-slate-200" data-testid="select-seats">
                    <SelectValue placeholder="Seats" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((num) => (
                      <SelectItem key={num} value={String(num)}>{num} seat{num > 1 ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <PoundSterling className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
                  <Input 
                    type="number" 
                    placeholder="£/seat"
                    min="1"
                    max="100"
                    step="1"
                    className="pl-6 h-7 text-xs bg-white dark:bg-slate-900 border-slate-200"
                    value={pricePerSeat}
                    onChange={(e) => setPricePerSeat(e.target.value)}
                    aria-label="Price per seat in pounds"
                    data-testid="input-price-per-seat"
                  />
                </div>
              </div>

              <div className="flex gap-1.5">
                <Input 
                  type="number" 
                  placeholder="Detour"
                  min="1"
                  step="any"
                  className="h-7 text-xs bg-white dark:bg-slate-900 border-slate-200 flex-1"
                  value={maxDetour}
                  onChange={(e) => setMaxDetour(e.target.value)}
                  aria-label="Maximum detour distance"
                  data-testid="input-max-detour"
                />
                <Select value={detourUnit} onValueChange={(v) => setDetourUnit(v as DetourUnit)}>
                  <SelectTrigger className="h-7 w-12 text-xs bg-white dark:bg-slate-900 border-slate-200" data-testid="select-detour-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(UNIT_LABELS) as DetourUnit[]).map((unit) => (
                      <SelectItem key={unit} value={unit}>{UNIT_LABELS[unit]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  type="submit"
                  className="h-7 px-3 text-xs font-semibold"
                  disabled={createRouteMutation.isPending}
                  data-testid="button-publish-route"
                >
                  {createRouteMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Publish"
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      <Button
        onClick={handleRecenter}
        size="icon"
        className="fixed right-2 z-50 h-8 w-8 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-primary shadow-lg border border-slate-200 hover:bg-slate-100"
        style={{ bottom: 'calc(45vh + 8px)' }}
        data-testid="button-recenter-map"
      >
        <Crosshair className="h-4 w-4" />
      </Button>

      <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-2 space-y-1.5" style={{ maxHeight: '45vh' }}>
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-lg shadow-lg border border-white/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => handleCardToggle('offers')}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Rider Offers</span>
              <Badge variant={!showFutureDates ? "default" : "outline"} className="text-[10px]">
                {showFutureDates ? 'All' : '24h'}
              </Badge>
              {displayOffers.length > 0 && <Badge className="bg-primary text-white text-xs">{displayOffers.length}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Switch
                  id="future-dates-driver"
                  checked={showFutureDates}
                  onCheckedChange={setShowFutureDates}
                  className="scale-75"
                  data-testid="switch-future-dates-driver"
                />
                <label htmlFor="future-dates-driver" className="text-[10px] text-muted-foreground cursor-pointer">Future</label>
              </div>
              {offersCardOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {!offersCardOpen && displayOffers.length > 0 && (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${displayOffers[0].riderId}`} />
                  <AvatarFallback>R</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{displayOffers[0].pickupLocation}</p>
                  <p className="text-muted-foreground truncate">→ {displayOffers[0].dropoffLocation}</p>
                </div>
                <Badge className="bg-primary text-white">£{displayOffers[0].offerPrice}</Badge>
              </div>
            </div>
          )}

          {!offersCardOpen && displayOffers.length === 0 && !offersLoading && (
            <div className="px-2 pb-2">
              <p className="text-xs text-muted-foreground text-center py-2">
                {showFutureDates ? "No rider offers available" : "No offers in next 24h"}
              </p>
            </div>
          )}

          {offersCardOpen && (
            <div className="px-2 pb-2 max-h-[40vh] overflow-y-auto space-y-1.5">
              {offersLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : displayOffers.length === 0 ? (
                <div className="text-center py-6">
                  <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {showFutureDates 
                      ? "No rider offers available at the moment."
                      : "No offers available in the next 24 hours."}
                  </p>
                  {!showFutureDates && (
                    <Button 
                      variant="link" 
                      onClick={() => setShowFutureDates(true)}
                      className="mt-1 h-auto p-0 text-xs"
                    >
                      Show future dates
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Post your route to attract riders!</p>
                </div>
              ) : (
                <>
                  {paginatedOffers.map((offer) => (
                    <div key={offer.id} className="bg-muted/30 rounded-lg p-3" data-testid={`card-offer-${offer.id}`}>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${offer.riderId}`} />
                          <AvatarFallback>R</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="text-yellow-500">★</span> 4.8 • {formatDate(offer.requestedTime)}
                            </div>
                            <span className="text-lg font-bold text-primary" data-testid={`text-price-${offer.id}`}>£{offer.offerPrice}</span>
                          </div>
                          <p className="text-sm font-medium truncate">{offer.pickupLocation}</p>
                          <p className="text-xs text-muted-foreground truncate">→ {offer.dropoffLocation}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {getOfferDistanceAndETA(offer) && (
                              <Badge variant="outline" className="text-[10px]">
                                <Navigation className="h-2.5 w-2.5 mr-0.5" />
                                {getOfferDistanceAndETA(offer)!.distance}
                              </Badge>
                            )}
                            <div className="flex-1" />
                            <Button 
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => handleAcceptOffer(offer.id)}
                              disabled={acceptOfferMutation.isPending}
                              data-testid={`button-accept-${offer.id}`}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Accept
                            </Button>
                            <Dialog open={bidDialogOpen && selectedOffer?.id === offer.id} onOpenChange={(open) => {
                              setBidDialogOpen(open);
                              if (open) setSelectedOffer(offer);
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-bid-${offer.id}`}>
                                  <MessageSquare className="mr-1 h-3 w-3" /> Bid
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
                      </div>
                    </div>
                  ))}
                  {displayOffers.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offersPage === 0} onClick={() => setOffersPage(p => p - 1)}>Prev</Button>
                      <span className="text-xs text-muted-foreground">
                        {offersPage + 1} / {Math.ceil(displayOffers.length / ITEMS_PER_PAGE)}
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={(offersPage + 1) * ITEMS_PER_PAGE >= displayOffers.length} onClick={() => setOffersPage(p => p + 1)}>Next</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-lg shadow-lg border border-white/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => handleCardToggle('active')}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold">Active Rides</span>
              {activeRides.length > 0 && <Badge className="bg-green-600 text-white text-xs">{activeRides.length}</Badge>}
            </div>
            {activeRidesCardOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </div>

          {!activeRidesCardOpen && activeRides.length > 0 && (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
                <Badge className={activeRides[0].status === 'in_progress' ? 'bg-green-500' : 'bg-blue-500'}>
                  {activeRides[0].status === 'in_progress' ? 'In Progress' : 'Scheduled'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{activeRides[0].pickupLocation}</p>
                </div>
                <span className="font-bold text-primary">£{activeRides[0].agreedPrice}</span>
              </div>
            </div>
          )}

          {!activeRidesCardOpen && activeRides.length === 0 && (
            <div className="px-2 pb-2">
              <p className="text-xs text-muted-foreground text-center py-2">No active rides</p>
            </div>
          )}

          {activeRidesCardOpen && (
            <div className="px-2 pb-2 max-h-[40vh] overflow-y-auto space-y-1.5">
              {activeRides.length === 0 ? (
                <div className="text-center py-6">
                  <Navigation className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active rides</p>
                  <p className="text-xs text-muted-foreground mt-1">Accept an offer to start a ride</p>
                </div>
              ) : (
                activeRides.map((ride) => (
                  <div key={ride.id} className="bg-muted/30 rounded-lg p-3" data-testid={`card-ride-${ride.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={ride.status === 'in_progress' ? 'bg-green-500' : 'bg-blue-500'}>
                        {ride.status === 'in_progress' ? 'In Progress' : 'Scheduled'}
                      </Badge>
                      <span className="text-lg font-bold text-primary">£{ride.agreedPrice}</span>
                    </div>
                    <p className="text-sm font-medium">{ride.pickupLocation} → {ride.dropoffLocation}</p>
                    <p className="text-xs text-muted-foreground mb-2">{formatDate(ride.scheduledTime)} at {formatTime(ride.scheduledTime)}</p>
                    <Button 
                      onClick={() => navigate(`/ride/${ride.id}`)}
                      className="w-full h-8 text-xs"
                      data-testid={`button-track-${ride.id}`}
                    >
                      Track Ride
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-lg shadow-lg border border-white/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => handleCardToggle('history')}
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Ride History</span>
              {completedRides.length > 0 && <Badge variant="outline" className="text-xs">{completedRides.length}</Badge>}
            </div>
            {historyCardOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </div>

          {!historyCardOpen && completedRides.length > 0 && (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{completedRides[0].pickupLocation}</p>
                  <p className="text-muted-foreground truncate">→ {completedRides[0].dropoffLocation}</p>
                </div>
                <span className="font-bold text-primary">£{completedRides[0].agreedPrice}</span>
              </div>
            </div>
          )}

          {!historyCardOpen && completedRides.length === 0 && (
            <div className="px-2 pb-2">
              <p className="text-xs text-muted-foreground text-center py-2">No completed rides yet</p>
            </div>
          )}

          {historyCardOpen && (
            <div className="px-2 pb-2 max-h-[40vh] overflow-y-auto space-y-1.5">
              {completedRides.length === 0 ? (
                <div className="text-center py-6">
                  <History className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No completed rides yet</p>
                </div>
              ) : (
                completedRides.map((ride) => (
                  <div key={ride.id} className="bg-muted/30 rounded-lg p-3 opacity-75" data-testid={`card-history-${ride.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ride.pickupLocation} → {ride.dropoffLocation}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(ride.scheduledTime)}</p>
                      </div>
                      <span className="text-lg font-bold text-primary">£{ride.agreedPrice}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
