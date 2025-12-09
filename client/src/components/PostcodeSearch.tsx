import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PostcodeSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  iconColor?: string;
  inputClassName?: string;
  buttonClassName?: string;
  textClassName?: string;
  testId?: string;
}

export default function PostcodeSearch({
  value,
  onChange,
  placeholder = "Enter postcode or address",
  label,
  labelClassName = "text-muted-foreground",
  iconColor = "text-muted-foreground",
  inputClassName = "",
  buttonClassName = "",
  textClassName = "text-muted-foreground",
  testId = "input-location",
}: PostcodeSearchProps) {
  const [postcode, setPostcode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showPostcodeInput, setShowPostcodeInput] = useState(false);
  const { toast } = useToast();

  const searchPostcode = async () => {
    if (!postcode.trim()) return;

    setIsSearching(true);
    try {
      const tokenResponse = await fetch("/api/mapbox-token");
      const { token } = await tokenResponse.json();

      const searchQuery = encodeURIComponent(postcode.trim() + ", UK");
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchQuery}.json?access_token=${token}&country=GB&types=postcode,address,place&limit=1`
      );
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const place = data.features[0];
        onChange(place.place_name);
        setPostcode("");
        setShowPostcodeInput(false);
        toast({
          title: "Location found",
          description: place.place_name,
        });
      } else {
        toast({
          title: "Postcode not found",
          description: "Please check the postcode and try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Postcode search error:", error);
      toast({
        title: "Search failed",
        description: "Unable to search for postcode",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchPostcode();
    }
  };

  return (
    <div className="space-y-2">
      {label && <label className={`text-sm font-medium ${labelClassName}`}>{label}</label>}
      
      {!showPostcodeInput ? (
        <div className="space-y-2">
          <div className="relative">
            <MapPin className={`absolute left-3 top-3 h-4 w-4 ${iconColor}`} />
            <Input
              placeholder={placeholder}
              className={`pl-9 h-11 ${inputClassName}`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              data-testid={testId}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`text-xs ${textClassName} hover:text-primary ${buttonClassName}`}
            onClick={() => setShowPostcodeInput(true)}
            data-testid={`${testId}-postcode-toggle`}
          >
            <Search className="h-3 w-3 mr-1" />
            Search by postcode
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-3 h-4 w-4 ${iconColor}`} />
              <Input
                placeholder="e.g. SW1A 1AA"
                className={`pl-9 h-11 ${inputClassName}`}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                data-testid={`${testId}-postcode`}
              />
            </div>
            <Button
              type="button"
              onClick={searchPostcode}
              disabled={isSearching || !postcode.trim()}
              className={`h-11 ${buttonClassName}`}
              data-testid={`${testId}-postcode-search`}
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
            </Button>
          </div>
          {value && (
            <p className={`text-xs ${textClassName} truncate`}>
              Current: {value}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`text-xs ${textClassName} hover:text-primary ${buttonClassName}`}
            onClick={() => setShowPostcodeInput(false)}
            data-testid={`${testId}-address-toggle`}
          >
            <MapPin className="h-3 w-3 mr-1" />
            Enter address manually
          </Button>
        </div>
      )}
    </div>
  );
}
