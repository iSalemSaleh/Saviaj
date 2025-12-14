import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Star, 
  Car, 
  Calendar, 
  Shield, 
  ArrowLeft, 
  Loader2,
  MapPin,
  Clock
} from "lucide-react";

interface DriverProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  driverRating: string | null;
  totalRatingsAsDriver: number | null;
  totalRidesAsDriver: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColor: string | null;
  driverVerified: boolean | null;
  createdAt: string | null;
}

interface Rating {
  id: number;
  rideId: number;
  raterId: string;
  ratedUserId: string;
  raterRole: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : star - 0.5 <= rating
              ? "fill-yellow-400/50 text-yellow-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffMonths / 12)} year${Math.floor(diffMonths / 12) > 1 ? 's' : ''} ago`;
}

function formatMemberSince(dateString: string | null) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function DriverProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: driver, isLoading: driverLoading, error: driverError } = useQuery<DriverProfile>({
    queryKey: [`/api/drivers/${id}/profile`],
    enabled: !!id,
  });

  const { data: ratings = [], isLoading: ratingsLoading } = useQuery<Rating[]>({
    queryKey: [`/api/ratings/user/${id}`],
    enabled: !!id,
  });

  const driverRatings = ratings.filter(r => r.raterRole === 'rider');

  if (driverLoading) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (driverError || !driver) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Button 
            variant="ghost" 
            onClick={() => window.history.back()}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Driver profile not found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const averageRating = driver.driverRating ? parseFloat(driver.driverRating) : 0;

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button 
          variant="ghost" 
          onClick={() => window.history.back()}
          className="mb-6"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card data-testid="card-driver-info">
              <CardContent className="p-6 text-center">
                <Avatar className="h-24 w-24 mx-auto mb-4">
                  <AvatarImage 
                    src={driver.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.id}`} 
                  />
                  <AvatarFallback className="text-2xl">
                    {driver.firstName?.charAt(0) || 'D'}
                  </AvatarFallback>
                </Avatar>
                
                <h1 className="text-xl font-bold text-primary" data-testid="text-driver-name">
                  {driver.firstName} {driver.lastName}
                </h1>
                
                <div className="flex items-center justify-center gap-2 mt-2">
                  {driver.driverVerified && (
                    <Badge className="bg-green-500 text-white" data-testid="badge-verified">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1 mt-4">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <span className="text-lg font-bold" data-testid="text-rating">
                    {averageRating > 0 ? averageRating.toFixed(1) : "New"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    ({driver.totalRatingsAsDriver || 0} reviews)
                  </span>
                </div>

                <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {driver.totalRidesAsDriver || 0} rides
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Since {formatMemberSince(driver.createdAt)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {(driver.vehicleMake || driver.vehicleModel) && (
              <Card data-testid="card-vehicle-info">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    Vehicle
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 text-sm">
                    {driver.vehicleColor && (
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full border"
                          style={{ 
                            backgroundColor: driver.vehicleColor.toLowerCase() === 'white' ? '#f8f8f8' :
                                            driver.vehicleColor.toLowerCase() === 'black' ? '#1a1a1a' :
                                            driver.vehicleColor.toLowerCase()
                          }}
                        />
                        <span className="capitalize">{driver.vehicleColor}</span>
                      </div>
                    )}
                    <p className="font-medium" data-testid="text-vehicle">
                      {driver.vehicleMake} {driver.vehicleModel}
                      {driver.vehicleYear && ` (${driver.vehicleYear})`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="md:col-span-2">
            <Card data-testid="card-reviews">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Reviews</span>
                  {driverRatings.length > 0 && (
                    <Badge variant="outline">{driverRatings.length} reviews</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ratingsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : driverRatings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Star className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No reviews yet</p>
                    <p className="text-sm mt-1">This driver hasn't received any ratings yet.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                      {driverRatings.map((review, index) => (
                        <div key={review.id} data-testid={`review-item-${review.id}`}>
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage 
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${review.raterId}`} 
                              />
                              <AvatarFallback>R</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">Rider</span>
                                  <StarRating rating={review.rating} />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatTimeAgo(review.createdAt)}
                                </span>
                              </div>
                              {review.comment && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {review.comment}
                                </p>
                              )}
                            </div>
                          </div>
                          {index < driverRatings.length - 1 && (
                            <Separator className="mt-4" />
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
