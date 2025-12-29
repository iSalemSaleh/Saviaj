import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { RideMap } from "@/components/map/RideMap";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import PaymentButton from "@/components/PaymentButton";
import Chat from "@/components/Chat";
import { apiRequest } from "@/lib/queryClient";
import { 
  MapPin, 
  Clock, 
  Navigation, 
  Phone, 
  MessageSquare, 
  Car, 
  CheckCircle,
  AlertCircle,
  PoundSterling,
  CreditCard,
  Star,
  Loader2,
  MapPinned,
  UserCheck,
  ChevronDown,
  ChevronUp,
  XCircle
} from "lucide-react";

interface Ride {
  id: number;
  riderId: string;
  driverId: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: string | null;
  pickupLng: string | null;
  dropoffLat: string | null;
  dropoffLng: string | null;
  agreedPrice: string;
  scheduledTime: string;
  status: string;
  paymentStatus: string | null;
  paymentDeadline: string | null;
  paymentIntentId: string | null;
  riderOfferId: number | null;
}

export default function RideTrackingPage() {
  const params = useParams<{ id: string }>();
  const rideId = parseInt(params.id || "0");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const [pendingPaymentSecret, setPendingPaymentSecret] = useState<string | null>(null);

  // Reset local state when rideId changes to prevent stale data
  useEffect(() => {
    setEta(null);
    setDistance(null);
    setPaymentSuccess(false);
    setShowRating(false);
    setRating(5);
    setRatingComment("");
    setShowChat(false);
    setPendingMessages([]);
    setShowDetails(false);
    setPendingPaymentSecret(null);
    
    // Force refetch fresh data
    queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
  }, [rideId, queryClient]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      setPaymentSuccess(true);
      toast({
        title: "Payment Successful",
        description: "Your ride has been paid. Thank you!",
      });
      window.history.replaceState({}, '', `/ride/${rideId}`);
    }
    // Handle pending payment redirect from bid acceptance
    if (urlParams.get('payment') === 'pending') {
      const secret = urlParams.get('secret');
      if (secret) {
        setPendingPaymentSecret(decodeURIComponent(secret));
      }
      window.history.replaceState({}, '', `/ride/${rideId}`);
    }
  }, [rideId, toast]);

  const { data: ride, isLoading: rideLoading } = useQuery<Ride>({
    queryKey: [`/api/rides/${rideId}`],
    enabled: rideId > 0,
    refetchInterval: 200, // Refresh every 0.2 seconds for real-time status updates
  });

  // Fetch driver details to get vehicle color for the map
  const { data: driverInfo } = useQuery<{
    id: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
  }>({
    queryKey: [`/api/users/${ride?.driverId}`],
    enabled: !!ride?.driverId,
  });

  const { data: hasRated } = useQuery<{ hasRated: boolean }>({
    queryKey: [`/api/ratings/check/${rideId}`],
    enabled: rideId > 0 && !!user,
  });

  const startPickupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/rides/${rideId}/start-pickup`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
      toast({ title: "On your way!", description: "Rider has been notified you're heading to pickup." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const arrivedPickupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/rides/${rideId}/arrived-pickup`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
      toast({ title: "You've Arrived!", description: "Waiting for passenger..." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startTripMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/rides/${rideId}/start-trip`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
      toast({ title: "Trip Started!", description: "Have a safe journey." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const completeTripMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/rides/${rideId}/complete`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
      toast({ title: "Trip Complete!", description: "Thank you for riding with AtlasRide." });
      setShowRating(true);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelRideMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/rides/${rideId}/cancel`, { reason: "Cancelled by user" });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      const message = data.refundProcessed 
        ? "The ride has been cancelled. A refund has been processed."
        : "The ride has been cancelled.";
      toast({ title: "Ride Cancelled", description: message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const submitRatingMutation = useMutation({
    mutationFn: async () => {
      const ratedUserId = userType === 'rider' ? ride?.driverId : ride?.riderId;
      const response = await apiRequest("POST", "/api/ratings", {
        rideId,
        ratedUserId,
        raterRole: userType,
        rating,
        comment: ratingComment || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ratings/check/${rideId}`] });
      setShowRating(false);
      toast({ title: "Thanks!", description: "Your rating has been submitted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const userType = (user as any)?.id === ride?.driverId ? 'driver' : 'rider';
  const currentUserId = (user as any)?.id;
  const otherUserId = userType === 'rider' ? ride?.driverId : ride?.riderId;
  const isRideActive = ride?.status === 'in_progress' || ride?.status === 'scheduled' || ride?.status === 'en_route_pickup' || ride?.status === 'matched';

  const handleChatMessage = useCallback((message: any) => {
    // Always try to add to chat if it's open
    if ((window as any).__chatAddMessage) {
      (window as any).__chatAddMessage(message);
    } else {
      // Store pending messages if chat is not open
      setPendingMessages(prev => [...prev, message]);
    }
    // Show toast notification for incoming messages (not messages we sent)
    if (message.type === 'chat_message' && message.senderId !== currentUserId && !showChat) {
      toast({
        title: "New Message",
        description: message.message.length > 50 
          ? message.message.substring(0, 50) + "..." 
          : message.message,
      });
    }
  }, [currentUserId, showChat, toast]);

  // When chat opens, flush pending messages
  useEffect(() => {
    if (showChat && pendingMessages.length > 0 && (window as any).__chatAddMessage) {
      pendingMessages.forEach(msg => {
        (window as any).__chatAddMessage(msg);
      });
      setPendingMessages([]);
    }
  }, [showChat, pendingMessages]);

  const {
    driverLocation,
    riderLocation,
    isConnected,
    error: locationError,
    sendChatMessage,
  } = useLocationTracking({
    rideId,
    userType,
    userId: currentUserId,
    enableTracking: isRideActive,
    onChatMessage: handleChatMessage,
  });

  const pickupLocation = {
    lat: parseFloat(ride?.pickupLat || "51.5074"),
    lng: parseFloat(ride?.pickupLng || "-0.1278"),
  };

  const dropoffLocation = {
    lat: parseFloat(ride?.dropoffLat || "51.5174"),
    lng: parseFloat(ride?.dropoffLng || "-0.1378"),
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_payment': return 'bg-amber-500';
      case 'scheduled': return 'bg-blue-500';
      case 'matched': return 'bg-blue-600';
      case 'en_route_pickup': return 'bg-amber-500';
      case 'arrived_pickup': return 'bg-green-500';
      case 'in_progress': return 'bg-green-600';
      case 'arrived_dropoff': return 'bg-green-700';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': case 'cancelled_by_rider': case 'cancelled_by_driver': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending_payment': return 'Awaiting Payment';
      case 'scheduled': return 'Scheduled';
      case 'matched': return 'Matched';
      case 'en_route_pickup': return 'Driver Coming';
      case 'arrived_pickup': return 'Driver Arrived';
      case 'in_progress': return 'On Trip';
      case 'arrived_dropoff': return 'Arrived';
      case 'completed': return 'Completed';
      case 'cancelled': case 'cancelled_by_rider': case 'cancelled_by_driver': return 'Cancelled';
      default: return status;
    }
  };

  const isPrePickup = ride?.status === 'scheduled' || ride?.status === 'matched' || ride?.status === 'en_route_pickup' || ride?.status === 'arrived_pickup';

  if (rideLoading) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Skeleton className="w-full h-[500px] rounded-xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Ride Not Found</h1>
          <p className="text-muted-foreground">This ride doesn't exist or you don't have access to it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      
      <div className="flex-1 flex flex-col px-3 pt-2 pb-3 max-w-lg mx-auto w-full min-h-0 overflow-y-auto">
        
        {/* Dynamic Map - takes remaining space */}
        <div className="flex-1 rounded-xl overflow-hidden shadow-lg border border-white/20 min-h-[120px] mb-2">
          <RideMap
            pickupLocation={pickupLocation}
            dropoffLocation={dropoffLocation}
            driverLocation={driverLocation}
            riderLocation={riderLocation}
            driverVehicleColor={driverInfo?.vehicleColor || null}
            showRoute={true}
            onEtaUpdate={setEta}
            onDistanceUpdate={setDistance}
            className="w-full h-full"
          />
        </div>

        {/* Bottom Cards - anchored, don't shrink */}
        <div className="shrink-0 space-y-2">
        
        {/* Combined Status + Route + Driver Card */}
        <div className="backdrop-blur-md bg-white/60 dark:bg-slate-800/60 rounded-xl border border-white/20 shadow-md p-2.5">
          {/* Top row: Status + ETA + Price */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className={`${getStatusColor(ride.status)} text-white text-[10px] px-1.5 py-0.5`}>
                {getStatusText(ride.status)}
              </Badge>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3 text-primary" />
                <span className="font-bold text-primary" data-testid="text-eta">{eta ? `${eta}m` : '--'}</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Navigation className="h-3 w-3 text-secondary" />
                <span className="font-bold text-secondary" data-testid="text-distance">{distance ? `${distance}mi` : '--'}</span>
              </div>
              {isConnected && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
            </div>
            <span className="text-base font-bold text-primary flex items-center" data-testid="text-fare">
              <PoundSterling className="h-3.5 w-3.5" />
              {ride.agreedPrice}
            </span>
          </div>
          
          {/* Route row - blue dot for pickup, red pin for dropoff */}
          <div className="flex items-center gap-1.5 text-[10px] mb-2 px-0.5">
            <div className="h-2.5 w-2.5 rounded-full bg-sky-500 border border-white shrink-0" />
            <p className="truncate flex-1" data-testid="text-pickup">{ride.pickupLocation}</p>
            <span className="text-muted-foreground">→</span>
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 border border-white shrink-0" style={{clipPath: 'polygon(50% 100%, 0% 30%, 100% 30%)'}} />
            <p className="truncate flex-1" data-testid="text-dropoff">{ride.dropoffLocation}</p>
          </div>

          {/* Driver/Rider row */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/30">
            <Avatar className="h-8 w-8">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userType === 'rider' ? ride.driverId : ride.riderId}`} />
              <AvatarFallback><Car className="h-3 w-3" /></AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">{userType === 'rider' ? 'Driver' : 'Rider'}</p>
              <div className="flex items-center text-[10px] text-muted-foreground">
                <span className="text-yellow-500 mr-0.5">★</span>4.9
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" data-testid="button-call">
                <Phone className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={showChat ? "default" : "outline"} 
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowChat(!showChat)}
                data-testid="button-message"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
              {/* Cancel button - solid red */}
              {(ride.status === 'pending_payment' || ride.status === 'scheduled' || ride.status === 'matched' || ride.status === 'en_route_pickup') && (
                <Button 
                  size="sm"
                  className="h-7 px-3 text-white text-xs hover:opacity-90"
                  style={{ backgroundColor: '#D93B24' }}
                  onClick={() => cancelRideMutation.mutate()}
                  disabled={cancelRideMutation.isPending}
                  data-testid="button-cancel-ride"
                >
                  {cancelRideMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Cancel'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && currentUserId && otherUserId && (
          <Chat
            rideId={rideId}
            currentUserId={currentUserId}
            otherUserId={otherUserId}
            sendChatMessage={sendChatMessage}
            isConnected={isConnected}
            isOpen={showChat}
            onClose={() => setShowChat(false)}
          />
        )}

        {/* Action Section - Integrated with status */}
        {userType === 'driver' && (ride.status === 'scheduled' || ride.status === 'matched' || ride.status === 'en_route_pickup' || ride.status === 'arrived_pickup' || ride.status === 'in_progress') && (
          <Button 
            className={`w-full h-9 text-sm ${
              ride.status === 'in_progress' ? 'bg-green-600 hover:bg-green-700' :
              ride.status === 'arrived_pickup' ? 'bg-green-500 hover:bg-green-600' :
              ride.status === 'en_route_pickup' ? 'bg-primary hover:bg-primary/90' :
              'bg-amber-500 hover:bg-amber-600'
            }`}
            onClick={() => {
              if (ride.status === 'scheduled' || ride.status === 'matched') startPickupMutation.mutate();
              else if (ride.status === 'en_route_pickup') arrivedPickupMutation.mutate();
              else if (ride.status === 'arrived_pickup') startTripMutation.mutate();
              else if (ride.status === 'in_progress') completeTripMutation.mutate();
            }}
            disabled={startPickupMutation.isPending || arrivedPickupMutation.isPending || startTripMutation.isPending || completeTripMutation.isPending}
            data-testid="button-action"
          >
            {(startPickupMutation.isPending || arrivedPickupMutation.isPending || startTripMutation.isPending || completeTripMutation.isPending) ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : ride.status === 'in_progress' ? (
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            ) : ride.status === 'arrived_pickup' ? (
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            ) : ride.status === 'en_route_pickup' ? (
              <MapPin className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <MapPinned className="mr-1.5 h-3.5 w-3.5" />
            )}
            {ride.status === 'in_progress' ? 'Complete Trip' : 
             ride.status === 'arrived_pickup' ? 'Start Trip' : 
             ride.status === 'en_route_pickup' ? 'I\'ve Arrived' : 
             'Go to Pickup'}
          </Button>
        )}
        
        {/* Pre-pickup rider alert - inline badge style */}
        {isPrePickup && userType === 'rider' && (
          <div className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium ${
            ride.status === 'arrived_pickup' 
              ? 'bg-green-100/80 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          }`}>
            <Car className={`h-3.5 w-3.5 ${ride.status === 'arrived_pickup' ? '' : 'animate-pulse'}`} />
            {ride.status === 'arrived_pickup' 
              ? 'Driver has arrived! Head to pickup point' 
              : ride.status === 'en_route_pickup' 
                ? `Driver arriving in ~${eta || '--'}m` 
                : 'Waiting for driver'}
          </div>
        )}

        {/* Rating UI - Ultra Compact */}
        {(showRating || (ride.status === 'completed' && !hasRated?.hasRated)) && (
          <div className="backdrop-blur-md bg-white/60 dark:bg-slate-800/60 rounded-xl border border-white/20 shadow-md p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-yellow-500" />
                Rate {userType === 'rider' ? 'Driver' : 'Rider'}
              </p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setRating(star)} data-testid={`star-${star}`}>
                    <Star className={`h-5 w-5 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                  </button>
                ))}
              </div>
              <Button size="sm" className="h-7 text-xs px-3" onClick={() => submitRatingMutation.mutate()} disabled={submitRatingMutation.isPending} data-testid="button-submit-rating">
                {submitRatingMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Submit'}
              </Button>
            </div>
          </div>
        )}

        {/* Payment Section for Riders - Inline */}
        {(ride.status === 'pending_payment' || ride.status === 'completed' || ride.status === 'in_progress') && userType === 'rider' && !paymentSuccess && (
          <div className="backdrop-blur-md bg-white/60 dark:bg-slate-800/60 rounded-xl border border-white/20 shadow-md p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">Pay £{ride.agreedPrice}</span>
              <span className="text-[9px] text-muted-foreground ml-auto">Powered by Stripe</span>
            </div>
            <PaymentButton
              amount={parseFloat(ride.agreedPrice)}
              rideId={ride.id}
              onSuccess={() => {
                setPaymentSuccess(true);
                toast({ title: "Payment Successful", description: "Your ride has been paid." });
              }}
              onError={(error) => toast({ title: "Payment Failed", description: error, variant: "destructive" })}
            />
          </div>
        )}

        {paymentSuccess && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-green-100/80 text-green-700 text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Payment Complete
          </div>
        )}

        {locationError && (
          <div className="backdrop-blur-md bg-orange-50/80 dark:bg-orange-950/50 rounded-xl border border-orange-200 shadow-md p-3">
            <div className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs">{locationError}</p>
            </div>
          </div>
        )}
        </div>{/* End of shrink-0 bottom cards wrapper */}
      </div>
    </div>
  );
}
