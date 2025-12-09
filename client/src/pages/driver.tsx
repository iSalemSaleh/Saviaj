import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Clock, Navigation, CheckCircle2, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock Data
const RIDER_OFFERS = [
  { id: 1, rider: "Emma W.", rating: 4.9, pickup: "Central Station", dropoff: "Tech Hub", offer: 22, distance: "0.5mi detour" },
  { id: 2, rider: "Michael B.", rating: 4.5, pickup: "City Mall", dropoff: "North Ave", offer: 18, distance: "Direct route" },
  { id: 3, rider: "Sophia L.", rating: 5.0, pickup: "University", dropoff: "Downtown", offer: 15, distance: "1.2mi detour" },
];

export default function DriverPage() {
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
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-primary-foreground/80">Starting Point</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-primary" />
                      <Input placeholder="Home / Current Location" className="pl-9 h-11 bg-white text-primary border-none" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-primary-foreground/80">Destination</label>
                    <div className="relative">
                      <Navigation className="absolute left-3 top-3 h-4 w-4 text-primary" />
                      <Input placeholder="Work / Office" className="pl-9 h-11 bg-white text-primary border-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-primary-foreground/80">Departure</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-primary" />
                        <Input type="time" className="pl-9 h-11 bg-white text-primary border-none" defaultValue="08:00" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-primary-foreground/80">Max Detour (mi)</label>
                      <Input type="number" placeholder="2" className="h-11 bg-white text-primary border-none" />
                    </div>
                  </div>

                  <Button variant="secondary" className="w-full h-12 text-lg font-bold shadow-md mt-4 text-white">
                    Publish Route
                  </Button>
                </CardContent>
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
                  <TabsTrigger value="active">Active Rides</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="offers" className="space-y-4">
                {RIDER_OFFERS.map((offer) => (
                  <Card key={offer.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row">
                      {/* Offer Details */}
                      <div className="p-6 flex-1">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${offer.rider}`} />
                              <AvatarFallback>{offer.rider[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-primary">{offer.rider}</p>
                              <div className="flex items-center text-xs text-muted-foreground">
                                <span className="text-yellow-500">★</span> {offer.rating} • {offer.distance}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="block text-2xl font-bold text-primary">£{offer.offer}</span>
                            <span className="text-xs text-muted-foreground">offered price</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Pickup</span>
                            <p className="font-medium truncate">{offer.pickup}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Dropoff</span>
                            <p className="font-medium truncate">{offer.dropoff}</p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="bg-muted/30 p-4 sm:w-32 flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l">
                        <Button className="w-full bg-green-600 hover:bg-green-700">
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Accept
                        </Button>
                        <Button variant="outline" className="w-full text-muted-foreground hover:text-primary">
                          <MessageSquare className="mr-1 h-4 w-4" /> Bid
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </TabsContent>
              
              <TabsContent value="active">
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <div className="bg-muted rounded-full p-4 mb-4">
                    <Navigation className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-medium text-primary">No active rides</h3>
                  <p>Accept an offer to start a ride.</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
        </div>
      </div>
    </div>
  );
}