import { useState, useEffect } from "react";
import atlasRideLogo from "@assets/AtlasRide_Logo_Design_1765317206292.png";

interface SplashScreenProps {
  onComplete: () => void;
  duration?: number;
}

export default function SplashScreen({ onComplete, duration = 2500 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, duration - 500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-32 rounded-full bg-primary/10 animate-ripple-slow" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-24 rounded-full bg-primary/20 animate-ripple-slow animation-delay-300" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/30 animate-ripple-slow animation-delay-600" />
          </div>
          <img 
            src={atlasRideLogo} 
            alt="AtlasRide" 
            className="relative z-10 h-24 w-24 object-contain animate-fade-in"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
        <h1 className="mt-6 text-3xl font-bold text-primary animate-fade-in animation-delay-300">
          AtlasRide
        </h1>
        <p className="mt-2 text-muted-foreground animate-fade-in animation-delay-600">
          Your ride, your price
        </p>
      </div>
    </div>
  );
}
