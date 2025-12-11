import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Clock, PoundSterling, Calendar, Search, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";

interface DriverRoute {
  id: number;
  driverId: string;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  availableSeats: number;
  pricePerSeat: string | null;
  status: string;
}

export default function RiderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [offerPrice, setOfferPrice] = useState("");

  const { data: driverRoutes = [], isLoading: routesLoading } = useQuery<DriverRoute[]>({
    queryKey: ["/api/driver-routes"],
  });

  const createOfferMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/rider-offers", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your ride request has been posted!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rider-offers"] });
      setPickupLocation("");
      setDropoffLocation("");
      setRequestedTime("");
      setOfferPrice("");
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

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Panel: Request Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl">Where to?</CardTitle>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4">
                    <PostcodeSearch
                      value={pickupLocation}
                      onChange={setPickupLocation}
                      placeholder="Enter pickup address"
                      label="Pickup Location"
                      iconColor="text-muted-foreground"
                      testId="input-pickup"
                    />
                    
                    <PostcodeSearch
                      value={dropoffLocation}
                      onChange={setDropoffLocation}
                      placeholder="Enter destination"
                      label="Destination"
                      iconColor="text-secondary"
                      testId="input-dropoff"
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">When</label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="datetime-local" 
                            className="pl-9 h-11"
                            value={requestedTime}
                            onChange={(e) => setRequestedTime(e.target.value)}
                            data-testid="input-time"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Your Offer (£)</label>
                        <div className="relative">
                          <PoundSterling className="absolute left-3 top-3 h-4 w-4 text-accent" />
                          <Input 
                            type="number" 
                            placeholder="20"
                            min="1"
                            max="500"
                            step="1"
                            className="pl-9 h-11 font-bold text-accent"
                            value={offerPrice}
                            onChange={(e) => setOfferPrice(e.target.value)}
                            data-testid="input-price"
                          />
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full h-12 text-lg shadow-md mt-4"
                      disabled={createOfferMutation.isPending}
                      data-testid="button-post-request"
                    >
                      {createOfferMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        "Post Request"
                      )}
                    </Button>
                  </CardContent>
                </form>
              </Card>

              <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900">
                <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="bg-white border-blue-200">Tip</Badge>
                  Fair Pricing
                </h3>
                <p className="text-sm text-muted-foreground">
                  Offers within 10% of the recommended market rate are accepted 3x faster.
                </p>
              </div>
            </div>
          </div>

          {/* Right Panel: Available Routes */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-primary">Available Routes</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"><Search className="mr-2 h-4 w-4"/> Filter</Button>
                <Button variant="outline" size="sm"><Calendar className="mr-2 h-4 w-4"/> Date</Button>
              </div>
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
            ) : driverRoutes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No driver routes available at the moment.</p>
                  <p className="text-sm text-muted-foreground mt-2">Post a request and wait for drivers to respond!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {driverRoutes.map((route) => (
                  <Card key={route.id} className="group hover:border-primary/50 transition-all hover:shadow-md cursor-pointer" data-testid={`card-route-${route.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                            <AvatarFallback>D</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-primary">Driver</p>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <span className="text-yellow-500">★</span> 4.8 • {route.availableSeats} seats left
                            </div>
                          </div>
                        </div>
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
                        
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 rounded-full border-2 border-secondary bg-background z-10" />
                          <div>
                            <p className="text-sm font-medium">{route.endLocation}</p>
                          </div>
                        </div>
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
  );
}
