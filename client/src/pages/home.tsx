import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/home/Hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Coins, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />
      <Hero />
      
      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Coins className="h-10 w-10 text-accent" />}
              title="Name Your Price"
              description="Riders propose what they want to pay. No surge pricing, no hidden fees."
            />
            <FeatureCard 
              icon={<Users className="h-10 w-10 text-secondary" />}
              title="Community Driven"
              description="Connect directly with drivers and passengers going your way."
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-10 w-10 text-primary" />}
              title="Trusted Network"
              description="Verified profiles and route sharing for a safe journey every time."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="border-none shadow-none bg-muted/30 hover:bg-muted/50 transition-colors">
      <CardHeader>
        <div className="mb-4 inline-block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {icon}
        </div>
        <CardTitle className="text-xl font-bold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}