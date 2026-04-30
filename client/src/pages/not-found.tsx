import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <Card className="w-full max-w-md mx-auto border-none shadow-xl">
        <CardContent className="pt-8 pb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Compass className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-not-found-title">
            We can't find that page
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            The link may be broken, or the page may have been moved. Let's get you back on track.
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={() => setLocation("/")}
            data-testid="button-go-home"
          >
            <Home className="h-4 w-4 mr-2" />
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
