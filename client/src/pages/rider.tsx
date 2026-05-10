import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { getCurrentPosition, isNativePlatform, requestPermissions } from "@/lib/nativeGeolocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock, Calendar, ArrowRight, Loader2, Navigation, CalendarDays, Users, Edit2, X, Star, Shield, Car, Radio, Crown, ChevronDown, ChevronUp, Crosshair, Route, Bell, CreditCard, Repeat } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useUserMoneyFormatter } from "@/hooks/useUserMoney";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";
import { DateTimePicker } from "@/components/DateTimePicker";
import { RiderLocationMap } from "@/components/map/RiderLocationMap";
import { RecurringScheduleManager, DayPicker } from "@/components/RecurringScheduleManager";

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
  tier1MaxMiles: string | null;
  tier1RatePerMile: string | null;
  tier2MaxMiles: string | null;
  tier2RatePerMile: string | null;
  tier3RatePerMile: string | null;
  baseMinimumFare: string | null;
  driverTagline: string | null;
  serviceCategories: string[] | null;
  distanceFromPickup: number;
  currentLat: string | null;
  currentLng: string | null;
}

interface RiderRide {
  id: number;
  riderId: string;
  driverId: string;
  pickupLocation: string;
  dropoffLocation: string;
  agreedPrice: string;
  status: string;
  scheduledTime: string | null;
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
  // Use the signed-in user's Stripe Connect default currency for
  // every money render. A user who is also a driver will see all
  // prices in their payout currency on the rider screens too — so
  // the currency they decide on rider-side matches what they'd
  // earn on driver-side. Falls back to GBP for non-driver riders.
  const money = useUserMoneyFormatter();
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
  const [paymentBannerOpen, setPaymentBannerOpen] = useState(true);
  const [bannerHovered, setBannerHovered] = useState(false);
  const [routesCardOpen, setRoutesCardOpen] = useState(false);
  const [myRoutesCardOpen, setMyRoutesCardOpen] = useState(false);
  const [centerTrigger, setCenterTrigger] = useState(0); // Increment to recenter map
  const [formCollapsed, setFormCollapsed] = useState(false); // Collapsible form
  const [seatRequestOpen, setSeatRequestOpen] = useState(false);
  const [seatRequestRoute, setSeatRequestRoute] = useState<DriverRoute | null>(null);
  const [seatCount, setSeatCount] = useState(1);
  const [tripMessage, setTripMessage] = useState("");
  const INITIAL_DISPLAY_COUNT = 5;

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringTime, setRecurringTime] = useState("");

  // Negotiation state
  const [negotiateSheetOpen, setNegotiateSheetOpen] = useState(false);
  const [negotiateRoute, setNegotiateRoute] = useState<DriverRoute | null>(null);
  const [negotiateDriver, setNegotiateDriver] = useState<NearbyDriver | null>(null);
  const [negotiatePrice, setNegotiatePrice] = useState("");
  const [negotiateSeats, setNegotiateSeats] = useState(1);
  const [negotiateMessage, setNegotiateMessage] = useState("");
  const [isNegotiating, setIsNegotiating] = useState(false);

  // Hidden items state (persisted in localStorage)
  const [hiddenRoutes, setHiddenRoutes] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('hiddenRoutes');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [hiddenDrivers, setHiddenDrivers] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('hiddenDrivers');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const hideRoute = (routeId: number) => {
    setHiddenRoutes(prev => {
      const next = new Set(prev).add(routeId);
      localStorage.setItem('hiddenRoutes', JSON.stringify([...next]));
      return next;
    });
  };

  const hideDriver = (driverId: string) => {
    setHiddenDrivers(prev => {
      const next = new Set(prev).add(driverId);
      localStorage.setItem('hiddenDrivers', JSON.stringify([...next]));
      return next;
    });
  };

  // Auto-minimize payment banner after 3 seconds if not hovered
  useEffect(() => {
    if (paymentBannerOpen && !bannerHovered) {
      const timer = setTimeout(() => {
        setPaymentBannerOpen(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [paymentBannerOpen, bannerHovered]);

  useEffect(() => {
    const getLocation = async () => {
      try {
        if (isNativePlatform()) {
          await requestPermissions();
        }
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
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
            setPickupLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
        } catch (error) {
          console.log("Reverse geocode error:", error);
          setPickupLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch (error: any) {
        console.log("Geolocation error:", error?.message);
        setLocationLoading(false);
      }
    };
    getLocation();
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
      // Fetch all routes - frontend handles sorting by proximity
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
    refetchInterval: 5000, // Refresh every 5 seconds for bids
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

  // Query for rides that need action (pending payment, etc.)
  const { data: myRides = [] } = useQuery<RiderRide[]>({
    queryKey: ["/api/rides"],
    queryFn: async () => {
      const response = await fetch("/api/rides");
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 2000,
  });

  // Filter for rides awaiting payment
  const pendingPaymentRides = useMemo(() => {
    return myRides.filter(ride => ride.status === 'pending_payment' && ride.riderId === user?.id);
  }, [myRides, user]);

  // Query for bids on a specific offer - refreshes every 0.2 seconds when dialog is open
  const { data: offerBids = [], isLoading: bidsLoading, refetch: refetchBids } = useQuery<Bid[]>({
    queryKey: ["/api/bids/offer", viewingBidsForOffer?.id],
    queryFn: async () => {
      if (!viewingBidsForOffer) return [];
      const response = await fetch(`/api/bids/offer/${viewingBidsForOffer.id}`);
      return response.json();
    },
    enabled: !!viewingBidsForOffer && bidsDialogOpen,
    refetchInterval: bidsDialogOpen ? 3000 : false, // Refresh every 3 seconds when viewing bids
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

  // Calculate fare using tiered distance pricing (falls back to flat rate)
  const calculateTieredFare = (driver: NearbyDriver, distanceMiles: number): number => {
    const baseMin = parseFloat(driver.baseMinimumFare || "0");
    const tier1Max = parseFloat(driver.tier1MaxMiles || "0");
    const tier1Rate = parseFloat(driver.tier1RatePerMile || "0");
    const tier2Max = parseFloat(driver.tier2MaxMiles || "0");
    const tier2Rate = parseFloat(driver.tier2RatePerMile || "0");
    const tier3Rate = parseFloat(driver.tier3RatePerMile || "0");
    const hasTiers = tier1Rate > 0 && tier1Max > 0;

    let total = 0;
    if (!hasTiers) {
      const flatRate = parseFloat(driver.ratePerMile || "0");
      total = distanceMiles * flatRate;
    } else if (distanceMiles <= tier1Max) {
      total = distanceMiles * tier1Rate;
    } else if (!tier2Max || distanceMiles <= tier2Max) {
      total = tier1Max * tier1Rate + (distanceMiles - tier1Max) * (tier2Rate || tier1Rate);
    } else {
      total = tier1Max * tier1Rate + (tier2Max - tier1Max) * tier2Rate + (distanceMiles - tier2Max) * (tier3Rate || tier2Rate);
    }
    return Math.max(baseMin, total);
  };

  // Get rate display label (e.g. "from £1.50/mi" for tiered, "£2.50/mi" for flat)
  const getRateLabel = (driver: NearbyDriver): string => {
    const tier1Rate = parseFloat(driver.tier1RatePerMile || "0");
    const hasTiers = tier1Rate > 0 && parseFloat(driver.tier1MaxMiles || "0") > 0;
    if (hasTiers) {
      // Show lowest rate (last tier) as the "from" price
      const tier2Rate = parseFloat(driver.tier2RatePerMile || "0");
      const tier3Rate = parseFloat(driver.tier3RatePerMile || "0");
      const lowestRate = tier3Rate || tier2Rate || tier1Rate;
      return `from ${money.formatMajor(lowestRate)}/mi`;
    }
    return `${money.formatMajor(parseFloat(driver.ratePerMile || "0"))}/mi`;
  };

  // Calculate estimated cost based on driver's rate and trip distance
  const getEstimatedCost = (driver: NearbyDriver): string | null => {
    const hasRate = driver.ratePerMile || driver.tier1RatePerMile;
    if (!hasRate || !pickupCoords || !dropoffCoords) return null;
    const tripDistance = calculateDistance(
      pickupCoords.lat, 
      pickupCoords.lon, 
      dropoffCoords.lat, 
      dropoffCoords.lon
    );
    return calculateTieredFare(driver, tripDistance).toFixed(2);
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

  // Seat request mutation for driver routes
  const seatRequestMutation = useMutation({
    mutationFn: async ({ routeId, seats, message }: { routeId: number; seats: number; message: string }) => {
      const response = await apiRequest("POST", `/api/driver-routes/${routeId}/request-seat`, {
        seatsRequested: seats,
        tripMessage: message,
      });
      return response.json();
    },
    onSuccess: (ride) => {
      toast({
        title: "Seat Requested!",
        description: "Your request has been sent to the driver. They will respond shortly.",
      });
      setSeatRequestOpen(false);
      setSeatRequestRoute(null);
      setSeatCount(1);
      setTripMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-routes"] });
      navigate(`/ride/${ride.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to request seat. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSeatRequest = (route: DriverRoute) => {
    setSeatRequestRoute(route);
    setSeatCount(1);
    setTripMessage("");
    setSeatRequestOpen(true);
  };

  const submitSeatRequest = () => {
    if (!seatRequestRoute) return;
    if (!tripMessage.trim()) {
      toast({
        title: "Message Required",
        description: "Please describe your trip details so the driver can decide if it works for them.",
        variant: "destructive",
      });
      return;
    }
    seatRequestMutation.mutate({
      routeId: seatRequestRoute.id,
      seats: seatCount,
      message: tripMessage,
    });
  };

  // Negotiate route handler
  const handleNegotiateRoute = (route: DriverRoute) => {
    setNegotiateRoute(route);
    setNegotiateDriver(null);
    setNegotiatePrice(route.pricePerSeat || "");
    setNegotiateSeats(1);
    setNegotiateMessage("");
    setNegotiateSheetOpen(true);
  };

  // Negotiate Pro driver handler
  const handleNegotiateProDriver = (driver: NearbyDriver) => {
    if (!dropoffCoords || !dropoffLocation) {
      toast({
        title: "Set Destination",
        description: "Please set a destination first to negotiate with this driver.",
        variant: "destructive",
      });
      return;
    }
    setNegotiateDriver(driver);
    setNegotiateRoute(null);
    const estimatedCost = getEstimatedCost(driver);
    setNegotiatePrice(estimatedCost || "");
    setNegotiateSeats(1);
    setNegotiateMessage("");
    setNegotiateSheetOpen(true);
  };

  // Submit negotiation
  const submitNegotiation = async () => {
    const price = parseFloat(negotiatePrice);
    if (isNaN(price) || price < 2) {
      toast({
        title: "Invalid Price",
        description: `Minimum price is ${money.formatMajor(2)}`,
        variant: "destructive",
      });
      return;
    }

    setIsNegotiating(true);
    try {
      if (negotiateRoute) {
        // Route negotiation
        const response = await apiRequest("POST", "/api/route-negotiations", {
          driverRouteId: negotiateRoute.id,
          seatsRequested: negotiateSeats,
          proposedPrice: price,
          message: negotiateMessage || null,
        });
        if (response.ok) {
          toast({
            title: "Negotiation Sent!",
            description: "The driver will receive your offer and can accept, counter, or decline.",
          });
          setNegotiateSheetOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/route-negotiations/mine"] });
        } else {
          const data = await response.json();
          throw new Error(data.message || "Failed to start negotiation");
        }
      } else if (negotiateDriver) {
        // Pro driver negotiation
        const response = await apiRequest("POST", "/api/pro-negotiations", {
          driverId: negotiateDriver.id,
          pickupLocation: pickupLocation,
          dropoffLocation: dropoffLocation,
          pickupLat: pickupCoords?.lat,
          pickupLng: pickupCoords?.lon,
          dropoffLat: dropoffCoords?.lat,
          dropoffLng: dropoffCoords?.lon,
          estimatedDistance: routeInfo?.distance,
          proposedPrice: price,
          message: negotiateMessage || null,
        });
        if (response.ok) {
          toast({
            title: "Negotiation Sent!",
            description: "The driver will receive your offer and can accept, counter, or decline.",
          });
          setNegotiateSheetOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/pro-negotiations/mine"] });
        } else {
          const data = await response.json();
          throw new Error(data.message || "Failed to start negotiation");
        }
      }
    } catch (error: any) {
      toast({
        title: "Negotiation Failed",
        description: error.message || "Failed to start negotiation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsNegotiating(false);
    }
  };

  const handleRevisePrice = () => {
    if (!selectedOffer || !editPrice) return;
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 2 || price > 500) {
      toast({
        title: "Invalid Price",
        description: `Please enter a price between ${money.formatMajor(2)} and ${money.formatMajor(500)}`,
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
      if (hiddenRoutes.has(route.id)) return false;
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
  }, [driverRoutes, userLocation, showFutureDates, currentTime, hiddenRoutes]);

  const visibleNearbyDrivers = useMemo(() => {
    return nearbyDrivers.filter(driver => !hiddenDrivers.has(driver.id));
  }, [nearbyDrivers, hiddenDrivers]);

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
            // Fallback to coordinates if address resolution fails
            setPickupLocation(`${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`);
          }
        } catch {
          // Fallback to coordinates on error
          setPickupLocation(`${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`);
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

  const createRecurringMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/recurring-schedules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
      setIsRecurring(false);
      setRecurringDays([]);
      setRecurringTime("");
      setPickupLocation("");
      setDropoffLocation("");
      setOfferPrice("");
      setPickupCoords(null);
      setDropoffCoords(null);
      toast({
        title: "Recurring Schedule Created",
        description: "Your recurring ride requests have been posted for the next 14 days",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create recurring schedule",
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

    if (!pickupLocation || !dropoffLocation || !offerPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(offerPrice);
    if (isNaN(price) || price < 2 || price > 500) {
      toast({
        title: "Invalid Price",
        description: `Please enter a price between ${money.formatMajor(2)} and ${money.formatMajor(500)}`,
        variant: "destructive",
      });
      return;
    }

    if (isRecurring) {
      if (recurringDays.length === 0) {
        toast({
          title: "Select Days",
          description: "Please select at least one day for your recurring ride",
          variant: "destructive",
        });
        return;
      }
      if (!recurringTime) {
        toast({
          title: "Set Time",
          description: "Please set a departure time for your recurring ride",
          variant: "destructive",
        });
        return;
      }

      createRecurringMutation.mutate({
        type: "rider",
        entries: recurringDays.map(day => ({
          dayOfWeek: day,
          departureTime: recurringTime,
          startLocation: pickupLocation,
          endLocation: dropoffLocation,
          startLat: pickupCoords?.lat,
          startLng: pickupCoords?.lon,
          endLat: dropoffCoords?.lat,
          endLng: dropoffCoords?.lon,
          offerPrice: price,
        })),
      });
      return;
    }

    if (!requestedTime) {
      toast({
        title: "Missing Information",
        description: "Please select a departure time",
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
      pickupLat: pickupCoords?.lat?.toString(),
      pickupLng: pickupCoords?.lon?.toString(),
      dropoffLat: dropoffCoords?.lat?.toString(),
      dropoffLng: dropoffCoords?.lon?.toString(),
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
          nearbyDrivers={visibleNearbyDrivers}
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
      <div className={`fixed top-14 left-0 right-0 z-40 backdrop-blur-sm bg-background/40 border-b border-white/10 transition-all duration-300 overflow-hidden ${formCollapsed ? 'max-h-10' : isRecurring ? 'max-h-72' : 'max-h-48'}`}>
        <button
          onClick={() => setFormCollapsed(!formCollapsed)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-white/10"
          data-testid="button-toggle-form"
        >
          <div className="flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-primary">{formCollapsed ? 'Tap to request a ride' : 'Request a Ride'}</span>
          </div>
          {formCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
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
            <div className="flex items-center gap-2">
              <div className="flex items-center h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex-1 min-w-0">
                <div className="flex items-center px-1.5 min-w-0 overflow-hidden flex-1 justify-center">
                  {isRecurring && (
                    <input
                      type="time"
                      value={recurringTime}
                      onChange={(e) => setRecurringTime(e.target.value)}
                      className="h-5 text-[9px] bg-transparent border-none outline-none w-[58px] shrink-0"
                      data-testid="input-recurring-time"
                    />
                  )}
                  <div className={isRecurring ? 'hidden' : ''}>
                    <DateTimePicker
                      value={requestedTime}
                      onChange={setRequestedTime}
                      testId="input-time"
                      buttonClassName="h-5 text-[8px] bg-transparent border-none shadow-none px-0 min-w-0 whitespace-nowrap"
                      compact
                    />
                  </div>
                </div>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-500 shrink-0" />
                <div className="flex items-center gap-1 px-1.5 text-[10px] font-medium shrink-0">
                  <Repeat className={`h-2.5 w-2.5 ${isRecurring ? 'text-primary animate-pulse' : 'text-slate-400'}`} />
                  <span className={isRecurring ? 'text-primary' : 'text-slate-500'}>Recurring</span>
                  <Switch
                    checked={isRecurring}
                    onCheckedChange={setIsRecurring}
                    className="scale-50 ml-0.5"
                    data-testid="switch-recurring"
                  />
                </div>
              </div>
              <div className="relative w-20 shrink-0">
                <span className="absolute left-1.5 top-1 text-xs text-muted-foreground">{money.symbol}</span>
                <Input 
                  type="number" 
                  placeholder="Offer"
                  min="2"
                  max="500"
                  step="0.01"
                  className="pl-5 h-7 text-[11px] bg-white dark:bg-slate-900 border-gray-200"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  data-testid="input-price"
                />
              </div>
              <Button 
                type="submit" 
                className="h-7 px-3 text-xs font-semibold shrink-0"
                disabled={createOfferMutation.isPending || createRecurringMutation.isPending}
                data-testid="button-post-request"
              >
                {(createOfferMutation.isPending || createRecurringMutation.isPending) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isRecurring ? (
                  <><Repeat className="h-3 w-3 mr-0.5" /> Post</>
                ) : (
                  "Post"
                )}
              </Button>
            </div>
            {isRecurring && (
              <div className="flex items-center gap-2">
                <DayPicker
                  selectedDays={recurringDays}
                  onToggleDay={(day) => setRecurringDays(prev =>
                    prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                  )}
                />
              </div>
            )}
          </form>
        )}
      </div>

      {/* FLOATING BANNER: Pending Payment Rides - Collapsible */}
      {pendingPaymentRides.length > 0 && (
        <div className="fixed top-12 right-2 z-40">
          {paymentBannerOpen ? (
            <div 
              className="w-64 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-lg border border-primary/30 dark:border-primary/50 overflow-hidden"
              onMouseEnter={() => setBannerHovered(true)}
              onMouseLeave={() => setBannerHovered(false)}
              onTouchStart={() => setBannerHovered(true)}
              onTouchEnd={() => setBannerHovered(false)}
            >
              <button
                onClick={() => setPaymentBannerOpen(false)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-primary/10 transition-colors"
                data-testid="button-collapse-payment-banner"
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <CreditCard className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-primary">Ride Accepted!</span>
                  <Badge className="bg-primary/20 text-primary text-[10px]">{pendingPaymentRides.length}</Badge>
                </div>
                <ChevronUp className="h-4 w-4 text-primary" />
              </button>
              <div className="px-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
                {pendingPaymentRides.slice(0, 3).map((ride) => (
                  <div key={ride.id} className="bg-primary/10 rounded-lg p-2" data-testid={`pending-payment-ride-${ride.id}`}>
                    <div className="flex items-start gap-2 text-xs mb-1.5">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-slate-700 dark:text-slate-200">{ride.pickupLocation}</p>
                        <p className="text-slate-500 truncate text-[10px]">→ {ride.dropoffLocation}</p>
                      </div>
                      <span className="text-primary font-bold text-xs shrink-0">{money.formatMajor(parseFloat(ride.agreedPrice))}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-6 text-[10px]"
                        data-testid={`button-pay-ride-${ride.id}`}
                        onClick={() => navigate(`/ride/${ride.id}`)}
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        Pay Now
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] text-white hover:opacity-90"
                        style={{ backgroundColor: '#D93B24' }}
                        data-testid={`button-cancel-ride-${ride.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          fetch(`/api/rides/${ride.id}/cancel`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: 'Cancelled from notification' }),
                            credentials: 'include'
                          }).then(() => window.location.reload());
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPaymentBannerOpen(true)}
              className="flex items-center gap-2 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 hover:bg-primary/10 transition-colors"
              data-testid="button-expand-payment-banner"
            >
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center animate-pulse">
                <CreditCard className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-xs font-medium text-primary">{pendingPaymentRides.length} pending</span>
              <ChevronDown className="h-3 w-3 text-primary" />
            </button>
          )}
        </div>
      )}

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
        <div className={`backdrop-blur-sm bg-background/40 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${driversCardOpen ? 'max-h-[50vh]' : ''}`}>
          <button
            onClick={() => {
              setDriversCardOpen(!driversCardOpen);
              if (!driversCardOpen) { setRoutesCardOpen(false); setMyRoutesCardOpen(false); }
            }}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/10 transition-colors"
            data-testid="button-toggle-drivers-card"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Nearby Drivers</span>
              {visibleNearbyDrivers.length > 0 && <Badge className="bg-primary text-white text-xs">{visibleNearbyDrivers.length}</Badge>}
            </div>
            {driversCardOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          
          {/* Preview when collapsed - show nearest driver */}
          {!driversCardOpen && visibleNearbyDrivers.length > 0 && (
            <div className="px-3 pb-2">
              {(() => {
                const driver = visibleNearbyDrivers[0];
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
                      <p className="text-xs text-muted-foreground truncate">{getRateLabel(driver)} • {driver.distanceFromPickup.toFixed(1)} mi away</p>
                    </div>
                    {estimatedCost && <Badge className="bg-primary text-white shrink-0">{money.formatMajor(parseFloat(estimatedCost))}</Badge>}
                  </div>
                );
              })()}
            </div>
          )}
          {!driversCardOpen && visibleNearbyDrivers.length === 0 && !nearbyDriversLoading && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground text-center py-1">No Pro drivers nearby</p>
            </div>
          )}
          
          {/* Expanded content with horizontal scroll */}
          {driversCardOpen && (
            <div className="px-3 pb-3">
              {nearbyDriversLoading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-5 w-5 text-primary mx-auto animate-spin" />
                </div>
              ) : visibleNearbyDrivers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No Pro drivers nearby</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-nearby-drivers">
                  {visibleNearbyDrivers.map((driver) => {
                    const estimatedCost = getEstimatedCost(driver);
                    return (
                      <div key={driver.id} className="flex-shrink-0 p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10 snap-start relative" style={{ width: 'calc(50% - 4px)', minWidth: '160px', maxWidth: '200px' }} data-testid={`card-pro-driver-${driver.id}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); hideDriver(driver.id); }}
                          className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10"
                          data-testid={`button-hide-driver-${driver.id}`}
                        >
                          <X className="h-2.5 w-2.5 text-white" />
                        </button>
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
                            <span className="text-[10px] text-muted-foreground">{getRateLabel(driver)}</span>
                            {estimatedCost && <Badge className="bg-primary text-white text-[10px] px-1">{money.formatMajor(parseFloat(estimatedCost))}</Badge>}
                          </div>
                          {driver.serviceCategories && driver.serviceCategories.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {driver.serviceCategories.slice(0, 2).map((cat) => (
                                <span key={cat} className="text-[8px] px-1 py-0.5 bg-primary/10 text-primary rounded capitalize">
                                  {cat}
                                </span>
                              ))}
                              {driver.serviceCategories.length > 2 && (
                                <span className="text-[8px] text-muted-foreground">+{driver.serviceCategories.length - 2}</span>
                              )}
                            </div>
                          )}
                        </Link>
                        <div className="flex flex-col gap-1 mt-1">
                          {!dropoffCoords && (
                            <p className="text-[9px] text-orange-500 text-center">Enter destination above</p>
                          )}
                          <div className="flex gap-1">
                            <Button size="sm" className="flex-1 h-6 text-[10px]" onClick={() => handleRequestProDriver(driver)} disabled={requestingDriverId === driver.id || !dropoffCoords} data-testid={`button-request-pro-driver-${driver.id}`}>
                              {requestingDriverId === driver.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Request'}
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleNegotiateProDriver(driver)} disabled={!dropoffCoords} data-testid={`button-negotiate-pro-driver-${driver.id}`}>
                              Negotiate
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Nearby Routes */}
        <div className={`backdrop-blur-sm bg-background/40 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${routesCardOpen ? 'max-h-[50vh]' : ''}`}>
          <button
            onClick={() => {
              setRoutesCardOpen(!routesCardOpen);
              if (!routesCardOpen) { setDriversCardOpen(false); setMyRoutesCardOpen(false); }
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
                    {route.pricePerSeat && <Badge className="bg-primary text-white shrink-0">{money.formatMajor(parseFloat(route.pricePerSeat))}</Badge>}
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
          
          {/* Expanded content with horizontal scroll */}
          {routesCardOpen && (
            <div className="px-3 pb-3">
              {routesLoading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-5 w-5 text-primary mx-auto animate-spin" />
                </div>
              ) : filteredAndSortedRoutes.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No routes available</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-nearby-routes">
                  {filteredAndSortedRoutes.map((route) => (
                    <div key={route.id} className="flex-shrink-0 p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10 snap-start relative" style={{ width: 'calc(50% - 4px)', minWidth: '160px', maxWidth: '200px' }} data-testid={`card-route-${route.id}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); hideRoute(route.id); }}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10"
                        data-testid={`button-hide-route-${route.id}`}
                      >
                        <X className="h-2.5 w-2.5 text-white" />
                      </button>
                      <Link href={`/driver/${route.driverId}`} className="block" data-testid={`link-driver-profile-${route.id}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={route.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                            <AvatarFallback className="text-[10px]">{route.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium truncate flex-1" data-testid={`text-driver-name-route-${route.id}`}>{route.driver?.firstName || 'Driver'}</span>
                          {route.pricePerSeat && <Badge className="bg-primary text-white text-[10px] px-1">{money.formatMajor(parseFloat(route.pricePerSeat))}</Badge>}
                        </div>
                        <div className="text-[10px] space-y-0.5 mb-1">
                          <p className="truncate"><span className="text-primary">●</span> {route.startLocation}</p>
                          <p className="truncate"><span className="text-secondary">●</span> {route.endLocation}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="h-2 w-2 mr-0.5" />
                            {getTimeUntilDeparture(route.departureTime)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <Users className="h-2 w-2 mr-0.5" />
                            {route.availableSeats} seats
                          </Badge>
                        </div>
                      </Link>
                      <div className="flex gap-1 mt-1">
                        <Button
                          size="sm"
                          className="flex-1 h-6 text-[10px]"
                          onClick={(e) => { e.stopPropagation(); handleSeatRequest(route); }}
                          data-testid={`button-request-seat-${route.id}`}
                        >
                          Request
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          onClick={(e) => { e.stopPropagation(); handleNegotiateRoute(route); }}
                          data-testid={`button-negotiate-route-${route.id}`}
                        >
                          Negotiate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recurring Schedules Manager */}
        <RecurringScheduleManager type="rider" />

        {/* Card 3: My Routes (max 10 routes, no pagination) */}
        <div className={`backdrop-blur-sm bg-background/40 rounded-xl border border-white/20 shadow-lg overflow-hidden transition-all duration-300 ${myRoutesCardOpen ? 'max-h-[50vh]' : ''}`}>
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
                      <Badge className="bg-primary text-white">{money.formatMajor(parseFloat(offer.offerPrice))}</Badge>
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
          
          {/* Expanded content with horizontal scroll */}
          {myRoutesCardOpen && (
            <div className="px-3 pb-3">
              {myPendingOffers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">No pending requests</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Post a request above to get started</p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" data-testid="scroll-my-routes">
                  {myPendingOffers.slice(0, 10).map((offer) => (
                    <div key={offer.id} className="flex-shrink-0 p-2 bg-white/30 dark:bg-white/10 rounded-lg border border-white/10 snap-start relative" style={{ width: 'calc(50% - 4px)', minWidth: '160px', maxWidth: '200px' }} data-testid={`my-route-${offer.id}`}>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium truncate">{offer.pickupLocation}</p>
                          <p className="text-[10px] text-muted-foreground">to</p>
                          <p className="text-[10px] font-medium truncate">{offer.dropoffLocation}</p>
                        </div>
                        <Badge className="bg-primary text-white text-[10px] shrink-0">{money.formatMajor(parseFloat(offer.offerPrice))}</Badge>
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
                Current price: <strong>{money.formatMajor(parseFloat(selectedOffer.offerPrice))}</strong>
              </p>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">New Price ({money.symbol})</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-base text-muted-foreground">{money.symbol}</span>
                <Input 
                  type="number"
                  placeholder="Enter new price"
                  min="2"
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
              <p><strong>Your offer:</strong> {money.formatMajor(parseFloat(viewingBidsForOffer.offerPrice))}</p>
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
                            {money.formatMajor(parseFloat(bid.bidPrice))}
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

      {/* Seat Request Dialog */}
      <Dialog open={seatRequestOpen} onOpenChange={(open) => { setSeatRequestOpen(open); if (!open) setSeatRequestRoute(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Request a Seat
            </DialogTitle>
            <DialogDescription>
              Describe your trip so the driver can decide if it works for them
            </DialogDescription>
          </DialogHeader>
          {seatRequestRoute && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p><strong>Route:</strong> {seatRequestRoute.startLocation} → {seatRequestRoute.endLocation}</p>
                <p><strong>Departure:</strong> {new Date(seatRequestRoute.departureTime).toLocaleString()}</p>
                <p><strong>Available seats:</strong> {seatRequestRoute.availableSeats}</p>
                {seatRequestRoute.pricePerSeat && <p><strong>Price per seat:</strong> {money.formatMajor(parseFloat(seatRequestRoute.pricePerSeat))}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="seat-count">Number of seats</Label>
                <Select value={seatCount.toString()} onValueChange={(val) => setSeatCount(parseInt(val))}>
                  <SelectTrigger id="seat-count" data-testid="select-seat-count">
                    <SelectValue placeholder="Select seats" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: seatRequestRoute.availableSeats }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>{num} {num === 1 ? 'seat' : 'seats'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="trip-message">Trip Details <span className="text-destructive">*</span></Label>
                <Textarea
                  id="trip-message"
                  placeholder="E.g., 'I need to get from central Manchester to the airport around 2pm. I can meet near a bus stop on your route.'"
                  value={tripMessage}
                  onChange={(e) => setTripMessage(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="textarea-trip-message"
                />
                <p className="text-xs text-muted-foreground">Include where you need pickup/dropoff and any timing preferences</p>
              </div>
              
              {seatRequestRoute.pricePerSeat && (
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="text-sm font-medium">Total: {money.formatMajor(parseFloat(seatRequestRoute.pricePerSeat) * seatCount)}</p>
                </div>
              )}
              
              <Button
                onClick={submitSeatRequest}
                className="w-full"
                disabled={seatRequestMutation.isPending || !tripMessage.trim()}
                data-testid="button-submit-seat-request"
              >
                {seatRequestMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Request...</>
                ) : (
                  "Send Request"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Negotiate Price Sheet */}
      <Sheet open={negotiateSheetOpen} onOpenChange={(open) => { setNegotiateSheetOpen(open); if (!open) { setNegotiateRoute(null); setNegotiateDriver(null); } }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="text-base font-bold text-primary leading-none">{money.symbol}</span>
              Negotiate Price
            </SheetTitle>
            <SheetDescription>
              Make an offer. The driver can accept, counter, or decline.
            </SheetDescription>
          </SheetHeader>
          
          <div className="space-y-4 py-4">
            {/* Route or Driver info */}
            {negotiateRoute && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={negotiateRoute.driver?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${negotiateRoute.driverId}`} />
                    <AvatarFallback>{negotiateRoute.driver?.firstName?.charAt(0) || 'D'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{negotiateRoute.driver?.firstName || 'Driver'}</p>
                    {negotiateRoute.driver?.driverRating && (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                        {parseFloat(negotiateRoute.driver.driverRating).toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs"><span className="text-primary">●</span> {negotiateRoute.startLocation}</p>
                <p className="text-xs"><span className="text-secondary">●</span> {negotiateRoute.endLocation}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(negotiateRoute.departureTime).toLocaleDateString()} {new Date(negotiateRoute.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Badge>
                  {negotiateRoute.pricePerSeat && (
                    <Badge className="bg-primary text-white text-xs">
                      Driver asks {money.formatMajor(parseFloat(negotiateRoute.pricePerSeat))}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            
            {negotiateDriver && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={negotiateDriver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${negotiateDriver.id}`} />
                    <AvatarFallback>{negotiateDriver.firstName?.charAt(0) || 'D'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{negotiateDriver.firstName || 'Driver'}</p>
                    {negotiateDriver.driverRating && (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                        {parseFloat(negotiateDriver.driverRating).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <Badge className="bg-amber-500 text-white text-xs">Pro Driver</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Rate: {getRateLabel(negotiateDriver)} • {negotiateDriver.distanceFromPickup.toFixed(1)} mi away</p>
                <div className="mt-2 text-xs">
                  <p><span className="text-primary">●</span> {pickupLocation}</p>
                  <p><span className="text-secondary">●</span> {dropoffLocation}</p>
                </div>
                {routeInfo && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Est. {routeInfo.distance.toFixed(1)} miles
                  </Badge>
                )}
              </div>
            )}
            
            {/* Seats (for routes only) */}
            {negotiateRoute && (
              <div className="space-y-2">
                <Label>Number of seats</Label>
                <Select value={negotiateSeats.toString()} onValueChange={(val) => setNegotiateSeats(parseInt(val))}>
                  <SelectTrigger data-testid="select-negotiate-seats">
                    <SelectValue placeholder="Select seats" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: negotiateRoute.availableSeats }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>{num} {num === 1 ? 'seat' : 'seats'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Price offer */}
            <div className="space-y-2">
              <Label htmlFor="negotiate-price">Your Offer ({money.symbol})</Label>
              <Input
                id="negotiate-price"
                type="number"
                step="0.50"
                min="2"
                value={negotiatePrice}
                onChange={(e) => setNegotiatePrice(e.target.value)}
                placeholder="Enter your price offer"
                data-testid="input-negotiate-price"
              />
              <p className="text-xs text-muted-foreground">{`Minimum ${money.formatMajor(2)}`}</p>
            </div>
            
            {/* Optional message */}
            <div className="space-y-2">
              <Label htmlFor="negotiate-message">Message (optional)</Label>
              <Textarea
                id="negotiate-message"
                placeholder="Add any notes for the driver..."
                value={negotiateMessage}
                onChange={(e) => setNegotiateMessage(e.target.value)}
                className="min-h-[60px]"
                data-testid="textarea-negotiate-message"
              />
            </div>
          </div>
          
          <SheetFooter>
            <Button
              onClick={submitNegotiation}
              className="w-full"
              disabled={isNegotiating || !negotiatePrice}
              data-testid="button-submit-negotiation"
            >
              {isNegotiating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Offer...</>
              ) : (
                `Send Offer: ${money.formatMajor(parseFloat(negotiatePrice || '0'))}`
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
