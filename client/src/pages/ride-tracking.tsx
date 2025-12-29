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
  ChevronUp
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
      case 'in_progress': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending_payment': return 'Awaiting Payment';
      case 'scheduled': return 'Scheduled';
      case 'matched': return 'Matched';
      case 'en_route_pickup': return 'Driver En Route';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const isPrePickup = ride?.status === 'scheduled' || ride?.status === 'matched' || ride?.status === 'en_route_pickup';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      
      <div className="px-3 py-2 space-y-2 max-w-lg mx-auto">
        
        {/* Compact Map */}
        <div className="rounded-xl overflow-hidden shadow-lg border border-white/20">
          <div className="h-[180px]">
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
        </div>

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
          
          {/* Route row */}
          <div className="flex items-center gap-1.5 text-[10px] mb-2 px-0.5">
            <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <p className="truncate flex-1" data-testid="text-pickup">{ride.pickupLocation}</p>
            <span className="text-muted-foreground">→</span>
            <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
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

        {/* Pre-pickup Status for Rider - Compact */}
        {isPrePickup && userType === 'rider' && (
          <div className="backdrop-blur-md bg-amber-50/80 dark:bg-amber-950/50 rounded-xl border border-amber-200 dark:border-amber-800 shadow-md p-3">
            <div className="flex items-center gap-2">
              {ride.status === 'en_route_pickup' ? (
                <>
                  <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center">
                    <Car className="h-4 w-4 text-white animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Driver is on the way!</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {eta ? `Arriving in ~${eta} min` : 'Calculating...'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Waiting for driver</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">Your ride is confirmed</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons - Compact */}
        {(ride.status === 'scheduled' || ride.status === 'matched') && userType === 'driver' && (
          <Button 
            className="w-full h-10 bg-amber-500 hover:bg-amber-600" 
            onClick={() => startPickupMutation.mutate()}
            disabled={startPickupMutation.isPending}
            data-testid="button-start-pickup"
          >
            {startPickupMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MapPinned className="mr-2 h-4 w-4" />
            )}
            Head to Pickup
          </Button>
        )}

        {ride.status === 'en_route_pickup' && userType === 'driver' && (
          <Button 
            className="w-full h-10" 
            onClick={() => startTripMutation.mutate()}
            disabled={startTripMutation.isPending}
            data-testid="button-start-trip"
          >
            {startTripMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="mr-2 h-4 w-4" />
            )}
            Start Trip
          </Button>
        )}

        {ride.status === 'in_progress' && userType === 'driver' && (
          <Button 
            className="w-full h-10 bg-green-600 hover:bg-green-700" 
            onClick={() => completeTripMutation.mutate()}
            disabled={completeTripMutation.isPending}
            data-testid="button-complete-ride"
          >
            {completeTripMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Complete Ride
          </Button>
        )}

        {/* Rating UI - Compact */}
        {(showRating || (ride.status === 'completed' && !hasRated?.hasRated)) && (
          <div className="backdrop-blur-md bg-white/60 dark:bg-slate-800/60 rounded-xl border border-white/20 shadow-md p-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <Star className="h-4 w-4 text-yellow-500" />
              Rate Your {userType === 'rider' ? 'Driver' : 'Rider'}
            </p>
            <div className="flex justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-0.5 transition-transform hover:scale-110"
                  data-testid={`star-${star}`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= rating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Add a comment (optional)"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              className="resize-none text-sm h-16 mb-2"
              data-testid="input-rating-comment"
            />
            <Button 
              className="w-full h-8 text-sm" 
              onClick={() => submitRatingMutation.mutate()}
              disabled={submitRatingMutation.isPending}
              data-testid="button-submit-rating"
            >
              {submitRatingMutation.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : null}
              Submit Rating
            </Button>
          </div>
        )}

        {/* Payment Section for Riders - Compact */}
        {(ride.status === 'pending_payment' || ride.status === 'completed' || ride.status === 'in_progress') && userType === 'rider' && !paymentSuccess && (
          <div className="backdrop-blur-md bg-white/60 dark:bg-slate-800/60 rounded-xl border border-white/20 shadow-md p-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <CreditCard className="h-4 w-4" />
              Pay for Ride
            </p>
            <PaymentButton
              amount={parseFloat(ride.agreedPrice)}
              rideId={ride.id}
              onSuccess={() => {
                setPaymentSuccess(true);
                toast({
                  title: "Payment Successful",
                  description: "Your ride has been paid. Thank you!",
                });
              }}
              onError={(error) => {
                toast({
                  title: "Payment Failed",
                  description: error,
                  variant: "destructive",
                });
              }}
            />
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              Secure payment powered by Stripe
            </p>
          </div>
        )}

        {paymentSuccess && (
          <div className="backdrop-blur-md bg-green-50/80 dark:bg-green-950/50 rounded-xl border border-green-200 shadow-md p-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <p className="text-sm font-medium">Payment Complete</p>
            </div>
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
      </div>
    </div>
  );
}
