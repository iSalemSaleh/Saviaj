import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Clock, Navigation, CheckCircle2, MessageSquare, Loader2, PoundSterling } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";

interface RiderOffer {
  id: number;
  riderId: string;
  pickupLocation: string;
  dropoffLocation: string;
  offerPrice: string;
  requestedTime: string;
  status: string;
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

export default function DriverPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [maxDetour, setMaxDetour] = useState("2");
  const [availableSeats, setAvailableSeats] = useState("3");
  const [pricePerSeat, setPricePerSeat] = useState("");

  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<RiderOffer | null>(null);
  const [bidPrice, setBidPrice] = useState("");
  const [bidMessage, setBidMessage] = useState("");

  const { data: riderOffers = [], isLoading: offersLoading } = useQuery<RiderOffer[]>({
    queryKey: ["/api/rider-offers", "pending"],
    queryFn: async () => {
      const response = await fetch("/api/rider-offers?status=pending");
      return response.json();
    },
  });

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
      setEndLocation("");
      setDepartureTime("");
      setMaxDetour("2");
      setAvailableSeats("3");
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

    createRouteMutation.mutate({
      startLocation,
      endLocation,
      departureTime: new Date(departureTime).toISOString(),
      maxDetourMiles: parseFloat(maxDetour),
      availableSeats: parseInt(availableSeats),
      pricePerSeat: pricePerSeat ? parseFloat(pricePerSeat) : null,
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
    if (!selectedOffer || !bidPrice) return;

    createBidMutation.mutate({
      riderOfferId: selectedOffer.id,
      bidPrice: parseFloat(bidPrice),
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
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Panel: Post Route */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24">
              <Card className="border-none shadow-lg bg-primary text-primary-foreground">
                <CardHeader>
                  <CardTitle className="text-2xl text-white">Post Your Route</CardTitle>
                  <p className="text-primary-foreground/80">Fill your empty seats and earn.</p>
                </CardHeader>
                <form onSubmit={handlePublishRoute}>
                  <CardContent className="space-y-4">
                    <PostcodeSearch
                      value={startLocation}
                      onChange={setStartLocation}
                      placeholder="Home / Current Location"
                      label="Starting Point"
                      labelClassName="text-primary-foreground/80"
                      iconColor="text-primary"
                      inputClassName="bg-white text-primary border-none"
                      textClassName="text-primary-foreground/70"
                      testId="input-start-location"
                    />
                    
                    <PostcodeSearch
                      value={endLocation}
                      onChange={setEndLocation}
                      placeholder="Work / Office"
                      label="Destination"
                      labelClassName="text-primary-foreground/80"
                      iconColor="text-primary"
                      inputClassName="bg-white text-primary border-none"
                      textClassName="text-primary-foreground/70"
                      testId="input-end-location"
                    />

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-primary-foreground/80">Departure Time</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-primary" />
                        <Input 
                          type="datetime-local" 
                          className="pl-9 h-11 bg-white text-primary border-none"
                          value={departureTime}
                          onChange={(e) => setDepartureTime(e.target.value)}
                          data-testid="input-departure-time"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-primary-foreground/80">Max Detour (mi)</label>
                        <Input 
                          type="number" 
                          placeholder="2" 
                          className="h-11 bg-white text-primary border-none"
                          value={maxDetour}
                          onChange={(e) => setMaxDetour(e.target.value)}
                          data-testid="input-max-detour"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-primary-foreground/80">Seats</label>
                        <Input 
                          type="number" 
                          placeholder="3" 
                          className="h-11 bg-white text-primary border-none"
                          value={availableSeats}
                          onChange={(e) => setAvailableSeats(e.target.value)}
                          data-testid="input-seats"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-primary-foreground/80">Price per Seat (£) - Optional</label>
                      <div className="relative">
                        <PoundSterling className="absolute left-3 top-3 h-4 w-4 text-primary" />
                        <Input 
                          type="number" 
                          placeholder="Leave blank for negotiation" 
                          className="pl-9 h-11 bg-white text-primary border-none"
                          value={pricePerSeat}
                          onChange={(e) => setPricePerSeat(e.target.value)}
                          data-testid="input-price-per-seat"
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit"
                      variant="secondary" 
                      className="w-full h-12 text-lg font-bold shadow-md mt-4"
                      disabled={createRouteMutation.isPending}
                      data-testid="button-publish-route"
                    >
                      {createRouteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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

          {/* Right Panel: Rider Offers */}
          <div className="lg:col-span-8">
            <Tabs defaultValue="offers" className="w-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-primary">Dashboard</h2>
                <TabsList>
                  <TabsTrigger value="offers">Rider Offers</TabsTrigger>
                  <TabsTrigger value="active">Active Rides ({activeRides.length})</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="offers" className="space-y-4">
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
                ) : riderOffers.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-12 text-center">
                      <p className="text-muted-foreground">No rider offers available at the moment.</p>
                      <p className="text-sm text-muted-foreground mt-2">Check back soon for new ride requests!</p>
                    </CardContent>
                  </Card>
                ) : (
                  riderOffers.map((offer) => (
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
                  ))
                )}
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
