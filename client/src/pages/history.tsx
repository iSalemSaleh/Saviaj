import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Clock, PoundSterling, Calendar, Users, Star, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface RiderOffer {
  id: number;
  riderId: string;
  pickupLocation: string;
  dropoffLocation: string;
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
  pricePerSeat: string | null;
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

const getStatusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>;
    case "cancelled":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Cancelled</Badge>;
    case "cancelled_by_rider":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Cancelled by Rider</Badge>;
    case "cancelled_by_driver":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Cancelled by Driver</Badge>;
    case "expired":
      return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> Expired</Badge>;
    case "pending":
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Past Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function HistoryPage() {
  const { user } = useAuth();

  const { data: myOffers = [], isLoading: offersLoading } = useQuery<RiderOffer[]>({
    queryKey: ["/api/rider-offers/mine"],
    queryFn: async () => {
      const response = await fetch("/api/rider-offers/mine");
      return response.json();
    },
    enabled: !!user,
  });

  const { data: myRides = [], isLoading: ridesLoading } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
    enabled: !!user,
  });

  const { data: myRoutes = [], isLoading: routesLoading } = useQuery<DriverRoute[]>({
    queryKey: ["/api/driver-routes/mine"],
    queryFn: async () => {
      const response = await fetch("/api/driver-routes/mine");
      return response.json();
    },
    enabled: !!user && !!(user as any).isDriver,
  });

  const pastOffers = useMemo(() => {
    const now = new Date();
    return myOffers.filter(offer => {
      const requestedTime = new Date(offer.requestedTime);
      return requestedTime < now || offer.status === "cancelled" || offer.status === "completed";
    }).sort((a, b) => new Date(b.requestedTime).getTime() - new Date(a.requestedTime).getTime());
  }, [myOffers]);

  const pastRoutes = useMemo(() => {
    const now = new Date();
    return myRoutes.filter(route => {
      const departureTime = new Date(route.departureTime);
      return departureTime < now || route.status === "cancelled" || route.status === "completed";
    }).sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime());
  }, [myRoutes]);

  const completedRides = useMemo(() => {
    return myRides.filter(ride => ride.status === "completed")
      .sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime());
  }, [myRides]);

  const cancelledRides = useMemo(() => {
    return myRides.filter(ride => 
      ride.status === "cancelled" ||
      ride.status === "cancelled_by_rider" || 
      ride.status === "cancelled_by_driver"
    ).sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime());
  }, [myRides]);

  const isDriver = user && (user as any).isDriver;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navbar />
      <main className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">History</h1>
          <p className="text-muted-foreground">View your past trips, requests, and routes</p>
        </div>

        <Tabs defaultValue="rides" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="rides" data-testid="tab-rides">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled" data-testid="tab-cancelled">
              <XCircle className="h-4 w-4 mr-2" />
              Cancelled
            </TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">
              <MapPin className="h-4 w-4 mr-2" />
              Requests
            </TabsTrigger>
            {isDriver && (
              <TabsTrigger value="routes" data-testid="tab-routes">
                <Users className="h-4 w-4 mr-2" />
                Routes
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="rides">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Completed Rides</CardTitle>
              </CardHeader>
              <CardContent>
                {ridesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : completedRides.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No completed rides yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedRides.map(ride => (
                      <div 
                        key={ride.id} 
                        className="p-4 border rounded-lg"
                        data-testid={`history-ride-${ride.id}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium truncate">{ride.pickupLocation}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium truncate">{ride.dropoffLocation}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(ride.scheduledTime), "d MMM yyyy, HH:mm")}
                            </span>
                            <span className="flex items-center gap-1">
                              <PoundSterling className="h-3 w-3" />
                              £{ride.agreedPrice}
                            </span>
                            <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cancelled">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Cancelled Rides</CardTitle>
              </CardHeader>
              <CardContent>
                {ridesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : cancelledRides.length === 0 ? (
                  <div className="text-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No cancelled rides</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cancelledRides.map(ride => (
                      <div 
                        key={ride.id} 
                        className="p-4 border rounded-lg"
                        data-testid={`history-cancelled-${ride.id}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium truncate">{ride.pickupLocation}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium truncate">{ride.dropoffLocation}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(ride.scheduledTime), "d MMM yyyy, HH:mm")}
                            </span>
                            <span className="flex items-center gap-1">
                              <PoundSterling className="h-3 w-3" />
                              £{ride.agreedPrice}
                            </span>
                            {getStatusBadge(ride.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Past Ride Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {offersLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : pastOffers.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No past requests</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pastOffers.map(offer => (
                      <div 
                        key={offer.id} 
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`history-offer-${offer.id}`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span className="font-medium">{offer.pickupLocation}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">{offer.dropoffLocation}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(offer.requestedTime), "d MMM yyyy, HH:mm")}
                            </span>
                            <span className="flex items-center gap-1">
                              <PoundSterling className="h-3 w-3" />
                              £{offer.offerPrice}
                            </span>
                          </div>
                        </div>
                        {getStatusBadge(offer.status)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isDriver && (
            <TabsContent value="routes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Past Routes</CardTitle>
                </CardHeader>
                <CardContent>
                  {routesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  ) : pastRoutes.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground">No past routes</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pastRoutes.map(route => (
                        <div 
                          key={route.id} 
                          className="flex items-center justify-between p-4 border rounded-lg"
                          data-testid={`history-route-${route.id}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-medium">{route.startLocation}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">{route.endLocation}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(route.departureTime), "d MMM yyyy, HH:mm")}
                              </span>
                              {route.pricePerSeat && (
                                <span className="flex items-center gap-1">
                                  <PoundSterling className="h-3 w-3" />
                                  £{route.pricePerSeat}/seat
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {route.availableSeats} seats
                              </span>
                            </div>
                          </div>
                          {getStatusBadge(route.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
