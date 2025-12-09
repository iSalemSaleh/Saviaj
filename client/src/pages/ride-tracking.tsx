import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { RideMap } from "@/components/map/RideMap";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  Clock, 
  Navigation, 
  Phone, 
  MessageSquare, 
  Car, 
  CheckCircle,
  AlertCircle,
  PoundSterling
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
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const { data: ride, isLoading: rideLoading } = useQuery<Ride>({
    queryKey: [`/api/rides/${rideId}`],
    enabled: rideId > 0,
  });

  const userType = (user as any)?.id === ride?.driverId ? 'driver' : 'rider';
  const isRideActive = ride?.status === 'in_progress' || ride?.status === 'scheduled';

  const {
    driverLocation,
    riderLocation,
    isConnected,
    error: locationError,
  } = useLocationTracking({
    rideId,
    userType,
    enableTracking: isRideActive,
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
      case 'in_progress': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Scheduled';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

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
                  <Button variant="outline" className="flex-1" data-testid="button-message">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            {ride.status === 'scheduled' && userType === 'driver' && (
              <Button className="w-full h-12 text-lg" data-testid="button-start-ride">
                <Car className="mr-2 h-5 w-5" />
                Start Ride
              </Button>
            )}

            {ride.status === 'in_progress' && userType === 'driver' && (
              <Button className="w-full h-12 text-lg bg-green-600 hover:bg-green-700" data-testid="button-complete-ride">
                <CheckCircle className="mr-2 h-5 w-5" />
                Complete Ride
              </Button>
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
