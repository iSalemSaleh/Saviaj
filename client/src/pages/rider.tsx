import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Clock, PoundSterling, Calendar, Search, ArrowRight } from "lucide-react";
import { useState } from "react";

// Mock Data
const AVAILABLE_ROUTES = [
  { id: 1, driver: "Alex M.", rating: 4.8, start: "Downtown", end: "Airport", time: "08:30 AM", seats: 3, price: 25 },
  { id: 2, driver: "Sarah K.", rating: 4.9, start: "Westside", end: "Tech Park", time: "09:00 AM", seats: 2, price: 15 },
  { id: 3, driver: "James R.", rating: 4.7, start: "North Hills", end: "University", time: "08:45 AM", seats: 1, price: 12 },
];

export default function RiderPage() {
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
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Pickup Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Current Location" className="pl-9 h-11" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Destination</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                      <Input placeholder="Enter destination" className="pl-9 h-11" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">When</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input type="time" className="pl-9 h-11" defaultValue="now" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Your Offer (£)</label>
                      <div className="relative">
                        <PoundSterling className="absolute left-3 top-3 h-4 w-4 text-accent" />
                        <Input type="number" placeholder="20" className="pl-9 h-11 font-bold text-accent" />
                      </div>
                    </div>
                  </div>

                  <Button className="w-full h-12 text-lg shadow-md mt-4">
                    Post Request
                  </Button>
                </CardContent>
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

          {/* Right Panel: Available Routes / Map */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-primary">Available Routes</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"><Search className="mr-2 h-4 w-4"/> Filter</Button>
                <Button variant="outline" size="sm"><Calendar className="mr-2 h-4 w-4"/> Date</Button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {AVAILABLE_ROUTES.map((route) => (
                <Card key={route.id} className="group hover:border-primary/50 transition-all hover:shadow-md cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${route.driver}`} />
                          <AvatarFallback>{route.driver[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-primary">{route.driver}</p>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <span className="text-yellow-500">★</span> {route.rating} • {route.seats} seats left
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-lg px-3 py-1 bg-primary/10 text-primary">
                        £{route.price}
                      </Badge>
                    </div>

                    <div className="space-y-3 relative">
                      {/* Connector Line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border -z-10" />
                      
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 rounded-full border-2 border-primary bg-background z-10" />
                        <div>
                          <p className="text-sm font-medium">{route.start}</p>
                          <p className="text-xs text-muted-foreground">{route.time}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 rounded-full border-2 border-secondary bg-background z-10" />
                        <div>
                          <p className="text-sm font-medium">{route.end}</p>
                          <p className="text-xs text-muted-foreground">~30 mins</p>
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
          </div>
          
        </div>
      </div>
    </div>
  );
}