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
  UserCheck
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
  }, [rideId, toast]);

  const { data: ride, isLoading: rideLoading } = useQuery<Ride>({
    queryKey: [`/api/rides/${rideId}`],
    enabled: rideId > 0,
    refetchInterval: 5000,
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
    if ((window as any).__chatAddMessage) {
      (window as any).__chatAddMessage(message);
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
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      
      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* Map Section */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden border-none shadow-lg">
              <div className="h-[500px] lg:h-[600px]">
                <RideMap
                  pickupLocation={pickupLocation}
                  dropoffLocation={dropoffLocation}
                  driverLocation={driverLocation}
                  riderLocation={riderLocation}
                  showRoute={true}
                  onEtaUpdate={setEta}
                  onDistanceUpdate={setDistance}
                  className="w-full h-full"
                />
              </div>
            </Card>

            {/* ETA Bar */}
            <Card className="mt-4 border-none shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">ETA</p>
                        <p className="text-xl font-bold text-primary" data-testid="text-eta">
                          {eta ? `${eta} min` : 'Calculating...'}
                        </p>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <Navigation className="h-5 w-5 text-secondary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Distance</p>
                        <p className="text-xl font-bold text-secondary" data-testid="text-distance">
                          {distance ? `${distance} mi` : '--'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge className={`${getStatusColor(ride.status)} text-white px-4 py-2`}>
                    {getStatusText(ride.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* Ride Details */}
            <Card className="border-none shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Ride Details</span>
                  {isConnected && (
                    <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                      <span className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                      Live
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Route Info */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pickup</p>
                      <p className="font-medium" data-testid="text-pickup">{ride.pickupLocation}</p>
                    </div>
                  </div>
                  <div className="ml-[5px] h-6 w-0.5 bg-border" />
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Dropoff</p>
                      <p className="font-medium" data-testid="text-dropoff">{ride.dropoffLocation}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fare</span>
                    <span className="text-2xl font-bold text-primary flex items-center" data-testid="text-fare">
                      <PoundSterling className="h-5 w-5" />
                      {ride.agreedPrice}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Driver/Rider Contact */}
            <Card className="border-none shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {userType === 'rider' ? 'Your Driver' : 'Your Rider'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userType === 'rider' ? ride.driverId : ride.riderId}`} />
                    <AvatarFallback><Car className="h-6 w-6" /></AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">Driver</p>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <span className="text-yellow-500 mr-1">★</span>
                      4.9 • 150 rides
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" data-testid="button-call">
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </Button>
                  <Button 
                    variant={showChat ? "default" : "outline"} 
                    className="flex-1" 
                    onClick={() => setShowChat(!showChat)}
                    data-testid="button-message"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {showChat ? "Hide Chat" : "Message"}
                  </Button>
                </div>
              </CardContent>
            </Card>

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

            {/* Pre-pickup Status for Rider */}
            {isPrePickup && userType === 'rider' && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {ride.status === 'en_route_pickup' ? (
                      <>
                        <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center">
                          <Car className="h-5 w-5 text-white animate-pulse" />
                        </div>
                        <div>
                          <p className="font-semibold text-amber-700 dark:text-amber-400">Driver is on the way!</p>
                          <p className="text-sm text-amber-600 dark:text-amber-500">
                            {eta ? `Arriving in ~${eta} minutes` : 'Calculating ETA...'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-blue-700 dark:text-blue-400">Waiting for driver</p>
                          <p className="text-sm text-blue-600 dark:text-blue-500">Your ride is confirmed</p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            {(ride.status === 'scheduled' || ride.status === 'matched') && userType === 'driver' && (
              <Button 
                className="w-full h-12 text-lg bg-amber-500 hover:bg-amber-600" 
                onClick={() => startPickupMutation.mutate()}
                disabled={startPickupMutation.isPending}
                data-testid="button-start-pickup"
              >
                {startPickupMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <MapPinned className="mr-2 h-5 w-5" />
                )}
                Head to Pickup
              </Button>
            )}

            {ride.status === 'en_route_pickup' && userType === 'driver' && (
              <Button 
                className="w-full h-12 text-lg" 
                onClick={() => startTripMutation.mutate()}
                disabled={startTripMutation.isPending}
                data-testid="button-start-trip"
              >
                {startTripMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <UserCheck className="mr-2 h-5 w-5" />
                )}
                Rider Picked Up - Start Trip
              </Button>
            )}

            {ride.status === 'in_progress' && userType === 'driver' && (
              <Button 
                className="w-full h-12 text-lg bg-green-600 hover:bg-green-700" 
                onClick={() => completeTripMutation.mutate()}
                disabled={completeTripMutation.isPending}
                data-testid="button-complete-ride"
              >
                {completeTripMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-5 w-5" />
                )}
                Complete Ride
              </Button>
            )}

            {/* Rating UI */}
            {(showRating || (ride.status === 'completed' && !hasRated?.hasRated)) && (
              <Card className="border-none shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    Rate Your {userType === 'rider' ? 'Driver' : 'Rider'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className="p-1 transition-transform hover:scale-110"
                        data-testid={`star-${star}`}
                      >
                        <Star
                          className={`h-8 w-8 ${
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
                    className="resize-none"
                    data-testid="input-rating-comment"
                  />
                  <Button 
                    className="w-full" 
                    onClick={() => submitRatingMutation.mutate()}
                    disabled={submitRatingMutation.isPending}
                    data-testid="button-submit-rating"
                  >
                    {submitRatingMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Submit Rating
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Payment Section for Riders */}
            {(ride.status === 'completed' || ride.status === 'in_progress') && userType === 'rider' && !paymentSuccess && (
              <Card className="border-none shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Pay for Ride
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    Secure payment powered by Stripe
                  </p>
                </CardContent>
              </Card>
            )}

            {paymentSuccess && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <p className="font-medium">Payment Complete</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {locationError && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm">{locationError}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
