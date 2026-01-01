import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { MapPin, Clock, Navigation, CheckCircle2, MessageSquare, Loader2, PoundSterling, Crosshair, Power, Radio, Bell, Check, X, ChevronDown, ChevronUp, Route, Users, Settings } from "lucide-react";
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

interface DriverRoute {
  id: number;
  driverId: string;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  availableSeats: number;
  pricePerSeat: string;
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
  seatsRequested?: number;
  tripMessage?: string;
  driverRouteId?: number;
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
  const [myOffersCardOpen, setMyOffersCardOpen] = useState(false);
  const [myRoutesCardOpen, setMyRoutesCardOpen] = useState(false);

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
  
  // Request banner state (matches rider pending payment banner behavior)
  const [requestBannerOpen, setRequestBannerOpen] = useState(true);
  const [requestBannerHovered, setRequestBannerHovered] = useState(false);
  const [negotiationBannerOpen, setNegotiationBannerOpen] = useState(true);
  const [negotiationBannerHovered, setNegotiationBannerHovered] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Auto-collapse request banner after 3 seconds if not hovered (matches rider page)
  useEffect(() => {
    if (requestBannerOpen && !requestBannerHovered) {
      const timer = setTimeout(() => {
        setRequestBannerOpen(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [requestBannerOpen, requestBannerHovered]);
  
  // Auto-collapse negotiation banner after 3 seconds if not hovered (matches rider page)
  useEffect(() => {
    if (negotiationBannerOpen && !negotiationBannerHovered) {
      const timer = setTimeout(() => {
        setNegotiationBannerOpen(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [negotiationBannerOpen, negotiationBannerHovered]);
  
  // Refs for tracking previous counts (used in effects after queries)
  const prevRequestsCount = useRef(0);
  const prevNegotiationsCount = useRef(0);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          setStartCoords({ lat, lon: lng });
          
          try {
            const response = await fetch(`/api/azure-maps/reverse-geocode?lat=${lat}&lon=${lng}`);
            const data = await response.json();
            if (data.address) {
              setStartLocation(data.address);
            } else {
              // Fallback to coordinates if address resolution fails
              setStartLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
          } catch (error) {
            console.log("Reverse geocode error:", error);
            // Fallback to coordinates on error
            setStartLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
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
    refetchInterval: 200, // Refresh every 0.2 seconds for time-critical bids
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

  const { data: myRides = [], isLoading: ridesLoading } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
    enabled: !!user,
    refetchInterval: 200, // Refresh every 0.2 seconds for time-critical updates
  });

  const { data: pendingRequests = [], isLoading: pendingRequestsLoading } = useQuery<Ride[]>({
    queryKey: ["/api/pro-driver/pending-requests"],
    enabled: !!user?.isCommercialDriver && isOnlineForHire,
    refetchInterval: 200, // Refresh every 0.2 seconds for time-critical updates
  });

  // Fetch incoming negotiations (route and pro hire)
  const { data: myNegotiations = [] } = useQuery<any[]>({
    queryKey: ["/api/route-negotiations/mine"],
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: myProNegotiations = [] } = useQuery<any[]>({
    queryKey: ["/api/pro-negotiations/mine"],
    enabled: !!user?.isCommercialDriver,
    refetchInterval: 5000,
  });

  // Fetch driver's own bids on rider offers
  const { data: myBids = [], isLoading: bidsLoading } = useQuery<any[]>({
    queryKey: ["/api/bids/mine"],
    enabled: !!user,
    refetchInterval: 5000,
  });
  
  // Fetch driver's own posted routes
  const { data: myPostedRoutes = [], isLoading: myRoutesLoading } = useQuery<DriverRoute[]>({
    queryKey: ["/api/driver-routes/mine"],
    enabled: !!user,
    refetchInterval: 5000,
  });

  // Filter to only pending negotiations where driver needs to respond
  const pendingNegotiations = [
    ...myNegotiations.filter((n: any) => n.status === 'pending' && n.driverId === user?.id && n.lastOfferBy === 'rider'),
    ...myProNegotiations.filter((n: any) => n.status === 'pending' && n.driverId === user?.id && n.lastOfferBy === 'rider'),
  ];
  
  // Reopen request banner when new requests arrive
  useEffect(() => {
    if (pendingRequests.length > prevRequestsCount.current) {
      setRequestBannerOpen(true);
    }
    prevRequestsCount.current = pendingRequests.length;
  }, [pendingRequests.length]);
  
  // Reopen negotiation banner when new negotiations arrive
  useEffect(() => {
    if (pendingNegotiations.length > prevNegotiationsCount.current) {
      setNegotiationBannerOpen(true);
    }
    prevNegotiationsCount.current = pendingNegotiations.length;
  }, [pendingNegotiations.length]);

  // All driver's pending offers (bids + negotiations where they made an offer)
  const myPendingBids = myBids.filter((b: any) => b.status === 'pending');
  const myPendingNegotiationOffers = [
    ...myNegotiations.filter((n: any) => n.status === 'pending' && n.lastOfferBy === 'driver'),
    ...myProNegotiations.filter((n: any) => n.status === 'pending' && n.lastOfferBy === 'driver'),
  ];

  const [negotiationLoading, setNegotiationLoading] = useState<number | null>(null);

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

  // Handle negotiation responses
  const handleNegotiationResponse = async (negotiation: any, action: 'accept' | 'decline', isProNegotiation: boolean) => {
    setNegotiationLoading(negotiation.id);
    try {
      const endpoint = isProNegotiation 
        ? `/api/pro-negotiations/${negotiation.id}/${action}`
        : `/api/route-negotiations/${negotiation.id}/${action}`;
      const response = await apiRequest("PATCH", endpoint, {});
      if (response.ok) {
        toast({
          title: action === 'accept' ? "Offer Accepted!" : "Offer Declined",
          description: action === 'accept' 
            ? "You've accepted the offer. Waiting for payment." 
            : "You've declined the negotiation.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/route-negotiations/mine"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pro-negotiations/mine"] });
        if (action === 'accept') {
          const data = await response.json();
          if (data.ride) {
            navigate(`/ride/${data.ride.id}`);
          }
        }
      } else {
        const data = await response.json();
        throw new Error(data.message || `Failed to ${action} negotiation`);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action} negotiation`,
        variant: "destructive",
      });
    } finally {
      setNegotiationLoading(null);
    }
  };

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
    if (isNaN(price) || price < 0.01 || price > 500) {
      toast({
        title: "Invalid Price",
        description: "Please enter a price between £0.01 and £500",
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

  const now = new Date();
  // Include all active ride statuses: pending_payment (waiting for rider to pay), scheduled (paid, ready to start), 
  // matched, en_route_pickup, arrived_pickup, and in_progress
  const activeStatuses = ["pending_payment", "scheduled", "matched", "en_route_pickup", "arrived_pickup", "in_progress"];
  const activeRides = myRides.filter(r => {
    if (!activeStatuses.includes(r.status)) return false;
    // For in_progress rides, always show; for others, check if not in the past
    if (r.status === "in_progress" || r.status === "en_route_pickup" || r.status === "arrived_pickup") return true;
    const scheduledTime = new Date(r.scheduledTime);
    return scheduledTime >= now;
  });
  const handleRecenter = () => {
    setCenterTrigger(prev => prev + 1);
  };

  const handleCardToggle = (card: 'offers' | 'active' | 'myOffers' | 'myRoutes') => {
    if (card === 'offers') {
      setOffersCardOpen(!offersCardOpen);
      setActiveRidesCardOpen(false);
      setMyOffersCardOpen(false);
      setMyRoutesCardOpen(false);
    } else if (card === 'active') {
      setActiveRidesCardOpen(!activeRidesCardOpen);
      setOffersCardOpen(false);
      setMyOffersCardOpen(false);
      setMyRoutesCardOpen(false);
    } else if (card === 'myOffers') {
      setMyOffersCardOpen(!myOffersCardOpen);
      setOffersCardOpen(false);
      setActiveRidesCardOpen(false);
      setMyRoutesCardOpen(false);
    } else {
      setMyRoutesCardOpen(!myRoutesCardOpen);
      setOffersCardOpen(false);
      setActiveRidesCardOpen(false);
      setMyOffersCardOpen(false);
    }
  };
  
  // Filter posted routes - show active routes that haven't departed yet
  const activePostedRoutes = myPostedRoutes.filter(route => {
    if (route.status !== 'active') return false;
    const departureTime = new Date(route.departureTime);
    return departureTime >= now;
  });

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

      {/* FLOATING BANNER: Incoming Ride Requests - Collapsible (matches rider pending payment style) */}
      {pendingRequests.length > 0 && (
        <div className="fixed top-12 right-2 z-[9990]">
          {requestBannerOpen ? (
            <div 
              className="w-64 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-lg border border-primary/30 dark:border-primary/50 overflow-hidden"
              onMouseEnter={() => setRequestBannerHovered(true)}
              onMouseLeave={() => setRequestBannerHovered(false)}
              onTouchStart={() => setRequestBannerHovered(true)}
              onTouchEnd={() => setRequestBannerHovered(false)}
            >
              <button
                onClick={() => setRequestBannerOpen(false)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-primary/10 transition-colors"
                data-testid="button-collapse-request-banner"
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <Bell className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-primary">Ride Requests</span>
                  <Badge className="bg-primary/20 text-primary text-[10px]">{pendingRequests.length}</Badge>
                </div>
                <ChevronUp className="h-4 w-4 text-primary" />
              </button>
              <div className="px-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
                {pendingRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="bg-primary/10 rounded-lg p-2" data-testid={`pending-request-${request.id}`}>
                    <div className="flex items-start gap-2 text-xs mb-1.5">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-slate-700 dark:text-slate-200">{request.pickupLocation}</p>
                        <p className="text-slate-500 truncate text-[10px]">→ {request.dropoffLocation}</p>
                      </div>
                      <span className="text-primary font-bold text-xs shrink-0">£{request.agreedPrice}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-6 text-[10px]"
                        data-testid={`button-accept-request-${request.id}`}
                        onClick={() => respondToRequestMutation.mutate({ rideId: request.id, action: 'accept' })}
                        disabled={respondToRequestMutation.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] text-white hover:opacity-90"
                        style={{ backgroundColor: '#D93B24' }}
                        data-testid={`button-decline-request-${request.id}`}
                        onClick={() => respondToRequestMutation.mutate({ rideId: request.id, action: 'decline' })}
                        disabled={respondToRequestMutation.isPending}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRequestBannerOpen(true)}
              className="flex items-center gap-2 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 hover:bg-primary/10 transition-colors"
              data-testid="button-expand-request-banner"
            >
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center animate-pulse">
                <Bell className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-xs font-medium text-primary">{pendingRequests.length} requests</span>
              <ChevronDown className="h-3 w-3 text-primary" />
            </button>
          )}
        </div>
      )}

      {/* FLOATING BANNER: Price Negotiations - Collapsible (matches rider pending payment style) */}
      {pendingNegotiations.length > 0 && (
        <div className={`fixed ${pendingRequests.length > 0 ? (requestBannerOpen ? 'top-56' : 'top-20') : 'top-12'} right-2 z-[9990]`}>
          {negotiationBannerOpen ? (
            <div 
              className="w-64 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-lg border border-primary/30 dark:border-primary/50 overflow-hidden"
              onMouseEnter={() => setNegotiationBannerHovered(true)}
              onMouseLeave={() => setNegotiationBannerHovered(false)}
              onTouchStart={() => setNegotiationBannerHovered(true)}
              onTouchEnd={() => setNegotiationBannerHovered(false)}
            >
              <button
                onClick={() => setNegotiationBannerOpen(false)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-primary/10 transition-colors"
                data-testid="button-collapse-negotiation-banner"
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <PoundSterling className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-primary">Negotiations</span>
                  <Badge className="bg-primary/20 text-primary text-[10px]">{pendingNegotiations.length}</Badge>
                </div>
                <ChevronUp className="h-4 w-4 text-primary" />
              </button>
              <div className="px-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
                {pendingNegotiations.slice(0, 3).map((negotiation: any) => {
                  const isProNegotiation = !negotiation.driverRouteId;
                  return (
                    <div key={`neg-${negotiation.id}-${isProNegotiation}`} className="bg-primary/10 rounded-lg p-2" data-testid={`pending-negotiation-${negotiation.id}`}>
                      <div className="flex items-start gap-2 text-xs mb-1.5">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          {negotiation.route ? (
                            <>
                              <p className="font-medium truncate text-slate-700 dark:text-slate-200">{negotiation.route.startLocation}</p>
                              <p className="text-slate-500 truncate text-[10px]">→ {negotiation.route.endLocation}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium truncate text-slate-700 dark:text-slate-200">{negotiation.pickupLocation}</p>
                              <p className="text-slate-500 truncate text-[10px]">→ {negotiation.dropoffLocation}</p>
                            </>
                          )}
                        </div>
                        <span className="text-primary font-bold text-xs shrink-0">£{negotiation.latestOffer?.amount || '0'}</span>
                      </div>
                      <div className="flex items-center gap-1 mb-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={negotiation.rider?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${negotiation.riderId}`} />
                          <AvatarFallback className="text-[8px]">{negotiation.rider?.firstName?.charAt(0) || 'R'}</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-slate-600 dark:text-slate-300">{negotiation.rider?.firstName || 'Rider'}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="flex-1 h-6 text-[10px]"
                          data-testid={`button-accept-negotiation-${negotiation.id}`}
                          onClick={() => handleNegotiationResponse(negotiation, 'accept', isProNegotiation)}
                          disabled={negotiationLoading === negotiation.id}
                        >
                          {negotiationLoading === negotiation.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Accept
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] text-white hover:opacity-90"
                          style={{ backgroundColor: '#D93B24' }}
                          data-testid={`button-decline-negotiation-${negotiation.id}`}
                          onClick={() => handleNegotiationResponse(negotiation, 'decline', isProNegotiation)}
                          disabled={negotiationLoading === negotiation.id}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNegotiationBannerOpen(true)}
              className="flex items-center gap-2 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 hover:bg-primary/10 transition-colors"
              data-testid="button-expand-negotiation-banner"
            >
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center animate-pulse">
                <PoundSterling className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-xs font-medium text-primary">{pendingNegotiations.length} offers</span>
              <ChevronDown className="h-3 w-3 text-primary" />
            </button>
          )}
        </div>
      )}

      <div className="fixed top-11 left-2 right-2 sm:right-auto sm:w-72 z-40">
        <div className="backdrop-blur-sm bg-background/40 rounded-lg shadow-lg border border-white/20">
          <div 
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => setFormExpanded(!formExpanded)}
          >
            <div className="flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">Post Your Route</span>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {user?.isCommercialDriver && (
                <>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200">
                    <Radio className={`h-2.5 w-2.5 ${isOnlineForHire ? 'text-green-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={isOnlineForHire ? 'text-green-600' : 'text-slate-500'}>{isOnlineForHire ? 'Online' : 'Offline'}</span>
                    <Switch
                      checked={isOnlineForHire}
                      onCheckedChange={handleToggleOnlineStatus}
                      disabled={isUpdatingOnlineStatus}
                      className="scale-50 ml-0.5"
                      data-testid="switch-online-status"
                    />
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
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
              <div onClick={() => setFormExpanded(!formExpanded)} className="cursor-pointer">
                {formExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
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

              <div className="grid grid-cols-2 gap-1.5">
                <DateTimePicker
                  value={departureTime}
                  onChange={setDepartureTime}
                  testId="input-departure-time"
                  buttonClassName="bg-white dark:bg-slate-900 border-slate-200 h-7 text-xs"
                  compact
                />
                <div className="grid grid-cols-2 gap-1">
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
                    <PoundSterling className="absolute left-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
                    <Input 
                      type="number" 
                      placeholder="£/Seat"
                      min="1"
                      max="100"
                      step="1"
                      className="pl-5 h-7 text-xs bg-white dark:bg-slate-900 border-slate-200"
                      value={pricePerSeat}
                      onChange={(e) => setPricePerSeat(e.target.value)}
                      aria-label="Price per Seat in pounds"
                      data-testid="input-price-per-seat"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Input 
                  type="number" 
                  placeholder="Detour"
                  min="1"
                  step="any"
                  className="h-7 text-xs bg-white dark:bg-slate-900 border-slate-200"
                  value={maxDetour}
                  onChange={(e) => setMaxDetour(e.target.value)}
                  aria-label="Maximum detour distance"
                  data-testid="input-max-detour"
                />
                <Select value={detourUnit} onValueChange={(v) => setDetourUnit(v as DetourUnit)}>
                  <SelectTrigger className="h-7 text-xs bg-white dark:bg-slate-900 border-slate-200" data-testid="select-detour-unit">
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
                  className="h-7 px-2 text-xs font-semibold"
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
        className="fixed right-2 z-50 h-8 w-8 rounded-full backdrop-blur-sm bg-background/40 text-primary shadow-lg border border-white/20 hover:bg-white/20"
        style={{ bottom: 'calc(45vh + 8px)' }}
        data-testid="button-recenter-map"
      >
        <Crosshair className="h-4 w-4" />
      </Button>

      <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-2 overflow-y-auto" style={{ maxHeight: '45vh' }}>
        <div className="space-y-1.5">
        <div className="backdrop-blur-sm bg-background/40 rounded-lg shadow-lg border border-white/20 overflow-hidden">
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
            <div className="px-2 pb-2">
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
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-rider-offers">
                  {displayOffers.map((offer) => (
                    <div key={offer.id} className="flex-shrink-0 bg-muted/30 rounded-lg p-2 snap-start" style={{ width: 'calc(50% - 4px)', minWidth: '160px', maxWidth: '200px' }} data-testid={`card-offer-${offer.id}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${offer.riderId}`} />
                          <AvatarFallback className="text-[10px]">R</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="text-yellow-500">★</span> 4.8
                          </div>
                        </div>
                        <Badge className="bg-primary text-white text-[10px] px-1" data-testid={`text-price-${offer.id}`}>£{offer.offerPrice}</Badge>
                      </div>
                      <p className="text-[10px] font-medium truncate">{offer.pickupLocation}</p>
                      <p className="text-[10px] text-muted-foreground truncate">→ {offer.dropoffLocation}</p>
                      <p className="text-[10px] text-muted-foreground mb-1">{formatDate(offer.requestedTime)}</p>
                      <div className="flex gap-1">
                        <Button 
                          size="sm"
                          className="h-6 text-[10px] flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => handleAcceptOffer(offer.id)}
                          disabled={acceptOfferMutation.isPending}
                          data-testid={`button-accept-${offer.id}`}
                        >
                          Accept
                        </Button>
                        <Dialog open={bidDialogOpen && selectedOffer?.id === offer.id} onOpenChange={(open) => {
                          setBidDialogOpen(open);
                          if (open) setSelectedOffer(offer);
                        }}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 text-[10px]" data-testid={`button-bid-${offer.id}`}>
                              Bid
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
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="backdrop-blur-sm bg-background/40 rounded-lg shadow-lg border border-white/20 overflow-hidden">
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
                <Badge className={
                  activeRides[0].status === 'in_progress' ? 'bg-green-500' : 
                  activeRides[0].status === 'pending_payment' ? 'bg-amber-500' :
                  activeRides[0].status === 'en_route_pickup' ? 'bg-amber-500' :
                  activeRides[0].status === 'arrived_pickup' ? 'bg-green-500' :
                  'bg-blue-500'
                }>
                  {activeRides[0].status === 'in_progress' ? 'In Progress' : 
                   activeRides[0].status === 'pending_payment' ? 'Awaiting Payment' :
                   activeRides[0].status === 'en_route_pickup' ? 'Going to Pickup' :
                   activeRides[0].status === 'arrived_pickup' ? 'At Pickup' :
                   'Ready to Start'}
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
            <div className="px-2 pb-2">
              {activeRides.length === 0 ? (
                <div className="text-center py-6">
                  <Navigation className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active rides</p>
                  <p className="text-xs text-muted-foreground mt-1">Accept an offer to start a ride</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-active-rides">
                  {activeRides.map((ride) => (
                    <div key={ride.id} className="flex-shrink-0 bg-muted/30 rounded-lg p-2 snap-start" style={{ width: 'calc(50% - 4px)', minWidth: '160px', maxWidth: '200px' }} data-testid={`card-ride-${ride.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge className={`text-[10px] ${
                          ride.status === 'in_progress' ? 'bg-green-500' : 
                          ride.status === 'pending_payment' ? 'bg-amber-500' :
                          ride.status === 'en_route_pickup' ? 'bg-amber-500' :
                          ride.status === 'arrived_pickup' ? 'bg-green-500' :
                          'bg-blue-500'
                        }`}>
                          {ride.status === 'in_progress' ? 'Active' : 
                           ride.status === 'pending_payment' ? 'Awaiting Pay' :
                           ride.status === 'en_route_pickup' ? 'To Pickup' :
                           ride.status === 'arrived_pickup' ? 'At Pickup' :
                           'Ready'}
                        </Badge>
                        <Badge className="bg-primary text-white text-[10px] px-1">£{ride.agreedPrice}</Badge>
                      </div>
                      <p className="text-[10px] font-medium truncate">{ride.pickupLocation}</p>
                      <p className="text-[10px] text-muted-foreground truncate">→ {ride.dropoffLocation}</p>
                      <p className="text-[10px] text-muted-foreground mb-1">{formatDate(ride.scheduledTime)}</p>
                      <Button 
                        onClick={() => navigate(`/ride/${ride.id}`)}
                        className="w-full h-6 text-[10px]"
                        data-testid={`button-track-${ride.id}`}
                      >
                        Track Ride
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* My Offers Card - Driver's bids and negotiations */}
        <div className="backdrop-blur-sm bg-background/40 rounded-lg shadow-lg border border-white/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => handleCardToggle('myOffers')}
          >
            <div className="flex items-center gap-2">
              <PoundSterling className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">My Offers</span>
              {(myPendingBids.length + myPendingNegotiationOffers.length) > 0 && (
                <Badge className="bg-primary text-white text-xs">
                  {myPendingBids.length + myPendingNegotiationOffers.length}
                </Badge>
              )}
            </div>
            {myOffersCardOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </div>

          {!myOffersCardOpen && (myPendingBids.length > 0 || myPendingNegotiationOffers.length > 0) && (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <PoundSterling className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {myPendingBids.length > 0 
                      ? myPendingBids[0].offer?.pickupLocation || 'Pending bid'
                      : myPendingNegotiationOffers[0]?.route?.startLocation || myPendingNegotiationOffers[0]?.pickupLocation || 'Pending offer'}
                  </p>
                  <p className="text-muted-foreground">Waiting for response</p>
                </div>
                <Badge variant="outline" className="text-primary">Pending</Badge>
              </div>
            </div>
          )}

          {!myOffersCardOpen && myPendingBids.length === 0 && myPendingNegotiationOffers.length === 0 && (
            <div className="px-2 pb-2">
              <p className="text-xs text-muted-foreground text-center py-2">No pending offers</p>
            </div>
          )}

          {myOffersCardOpen && (
            <div className="px-2 pb-2">
              {bidsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : myPendingBids.length === 0 && myPendingNegotiationOffers.length === 0 ? (
                <div className="text-center py-6">
                  <PoundSterling className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No pending offers</p>
                  <p className="text-xs text-muted-foreground mt-1">Bid on rider offers or negotiate on routes</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-my-offers">
                  {/* Bids */}
                  {myPendingBids.map((bid: any) => (
                    <div key={`bid-${bid.id}`} className="flex-shrink-0 bg-muted/30 rounded-lg p-2 snap-start w-[160px] min-w-[160px]" data-testid={`card-my-bid-${bid.id}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={bid.rider?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${bid.offer?.id}`} />
                          <AvatarFallback className="text-[10px]">R</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] font-medium truncate flex-1">{bid.rider?.firstName || 'Rider'}</span>
                        <Badge variant="outline" className="text-[10px] text-amber-600">Bid</Badge>
                      </div>
                      <p className="text-[10px] font-medium truncate">{bid.offer?.pickupLocation}</p>
                      <p className="text-[10px] text-muted-foreground truncate mb-1">→ {bid.offer?.dropoffLocation}</p>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Your bid:</span>
                        <Badge className="bg-primary text-white text-[10px] px-1">£{bid.bidPrice}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Original:</span>
                        <span>£{bid.offer?.offerPrice}</span>
                      </div>
                    </div>
                  ))}
                  {/* Negotiations */}
                  {myPendingNegotiationOffers.map((neg: any) => {
                    const isRouteNeg = !!neg.driverRouteId;
                    return (
                      <div key={`neg-${neg.id}-${isRouteNeg}`} className="flex-shrink-0 bg-muted/30 rounded-lg p-2 snap-start w-[160px] min-w-[160px]" data-testid={`card-my-negotiation-${neg.id}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={neg.rider?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${neg.riderId}`} />
                            <AvatarFallback className="text-[10px]">R</AvatarFallback>
                          </Avatar>
                          <span className="text-[10px] font-medium truncate flex-1">{neg.rider?.firstName || 'Rider'}</span>
                          <Badge variant="outline" className="text-[10px] text-blue-600">Nego</Badge>
                        </div>
                        <p className="text-[10px] font-medium truncate">
                          {isRouteNeg ? neg.route?.startLocation : neg.pickupLocation}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mb-1">
                          → {isRouteNeg ? neg.route?.endLocation : neg.dropoffLocation}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Latest:</span>
                          <Badge className="bg-primary text-white text-[10px] px-1">£{neg.latestOffer?.amount || '0'}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* My Routes Card - Driver's posted routes */}
        <div className="backdrop-blur-sm bg-background/40 rounded-lg shadow-lg border border-white/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
            onClick={() => handleCardToggle('myRoutes')}
          >
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">My Routes</span>
              {activePostedRoutes.length > 0 && (
                <Badge className="bg-primary text-white text-xs">
                  {activePostedRoutes.length}
                </Badge>
              )}
            </div>
            {myRoutesCardOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </div>

          {!myRoutesCardOpen && activePostedRoutes.length > 0 && (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <Route className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{activePostedRoutes[0].startLocation}</p>
                  <p className="text-muted-foreground truncate">→ {activePostedRoutes[0].endLocation}</p>
                </div>
                <Badge variant="outline" className="text-primary">{activePostedRoutes[0].availableSeats} seats</Badge>
              </div>
            </div>
          )}

          {!myRoutesCardOpen && activePostedRoutes.length === 0 && (
            <div className="px-2 pb-2">
              <p className="text-xs text-muted-foreground text-center py-2">No active routes</p>
            </div>
          )}

          {myRoutesCardOpen && (
            <div className="px-2 pb-2">
              {myRoutesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : activePostedRoutes.length === 0 ? (
                <div className="text-center py-6">
                  <Route className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active routes</p>
                  <p className="text-xs text-muted-foreground mt-1">Post a route above to share your journey</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-my-routes">
                  {activePostedRoutes.map((route) => (
                    <div key={route.id} className="flex-shrink-0 bg-muted/30 rounded-lg p-2 snap-start w-[160px] min-w-[160px]" data-testid={`card-my-route-${route.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px] text-green-600">Active</Badge>
                        <Badge className="bg-primary text-white text-[10px] px-1">£{route.pricePerSeat}/seat</Badge>
                      </div>
                      <p className="text-[10px] font-medium truncate">{route.startLocation}</p>
                      <p className="text-[10px] text-muted-foreground truncate">→ {route.endLocation}</p>
                      <p className="text-[10px] text-muted-foreground mb-1">{formatDate(route.departureTime)} {formatTime(route.departureTime)}</p>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Available:</span>
                        <span className="font-medium">{route.availableSeats} seats</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
