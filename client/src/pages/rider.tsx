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
import { MapPin, Clock, PoundSterling, Calendar, ArrowRight, Loader2, Navigation, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostcodeSearch from "@/components/PostcodeSearch";

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
  pricePerSeat: string | null;
  maxDetourMiles: string;
  status: string;
}

interface UserLocation {
  lat: number;
  lng: number;
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
  const [showFutureDates, setShowFutureDates] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          setPickupLocation("Your location");
          setPickupCoords({ lat, lon: lng });
          setLocationLoading(false);
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
  });

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

  const getDistanceFromUser = (route: DriverRoute): string | null => {
    if (!userLocation || !route.startLat || !route.startLng) return null;
    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lng,
      parseFloat(route.startLat),
      parseFloat(route.startLng)
    );
    if (distance < 1) {
      return `${Math.round(distance * 1760)} yards away`;
    }
    return `${distance.toFixed(1)} miles away`;
  };

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
                      onChange={handlePickupChange}
                      placeholder="Enter pickup address"
                      label="Pickup Location"
                      iconColor="text-muted-foreground"
                      testId="input-pickup"
                      showLocationPulse={pickupLocation === "Your location"}
                    />
                    
                    <PostcodeSearch
                      value={dropoffLocation}
                      onChange={handleDropoffChange}
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

          {/* Right Panel: Nearby & Available Routes */}
          <div className="lg:col-span-8 space-y-8">
            
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
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driverId}`} />
                                <AvatarFallback>D</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-primary">Driver</p>
                                <div className="flex items-center text-xs text-muted-foreground">
                                  <span className="text-yellow-500">★</span> 4.8 • {route.availableSeats} seats
                                </div>
                              </div>
                            </div>
                            {route.pricePerSeat && (
                              <Badge variant="secondary" className="text-lg px-3 py-1 bg-accent text-white">
                                £{route.pricePerSeat}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm"><span className="text-accent">●</span> {route.startLocation}</p>
                            <p className="text-sm"><span className="text-secondary">●</span> {route.endLocation}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {getTimeUntilDeparture(route.departureTime)}
                              </Badge>
                              {getDistanceFromUser(route) && (
                                <Badge variant="outline" className="text-xs">
                                  <Navigation className="h-3 w-3 mr-1" />
                                  {getDistanceFromUser(route)}
                                </Badge>
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

            {/* All Available Routes */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-primary">
                    {pickupCoords && dropoffCoords ? "All Available Routes" : "Available Routes"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {userLocation ? (
                      <span className="flex items-center gap-1">
                        <Navigation className="h-3 w-3" /> Sorted by distance from you
                      </span>
                    ) : locationLoading ? (
                      "Getting your location..."
                    ) : (
                      "Enable location for distance sorting"
                    )}
                  </p>
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
                      Show future dates
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
                        Show future dates
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
                      
                      <div className="flex items-center gap-2 mt-4">
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {getTimeUntilDeparture(route.departureTime)}
                        </Badge>
                        {getDistanceFromUser(route) && (
                          <Badge variant="outline" className="text-xs">
                            <Navigation className="h-3 w-3 mr-1" />
                            {getDistanceFromUser(route)}
                          </Badge>
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
