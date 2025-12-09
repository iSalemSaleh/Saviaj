import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2 } from "lucide-react";

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

interface Suggestion {
  id: string;
  place_name: string;
  text: string;
}

export default function PostcodeSearch({
  value,
  onChange,
  placeholder = "Enter postcode or address",
  label,
  labelClassName = "text-muted-foreground",
  iconColor = "text-muted-foreground",
  inputClassName = "",
  testId = "input-location",
}: PostcodeSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch("/api/mapbox-token");
        const { token } = await response.json();
        setMapboxToken(token);
      } catch (error) {
        console.error("Failed to fetch Mapbox token:", error);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchSuggestions = async (searchQuery: string) => {
    if (!searchQuery.trim() || !mapboxToken) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const encoded = encodeURIComponent(searchQuery.trim());
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&country=GB&autocomplete=true&types=address,postcode,poi,place&limit=8&proximity=ip`
      );
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSuggestions(data.features.map((f: any) => {
          const addressNumber = f.address || '';
          const streetName = f.text || '';
          const displayText = addressNumber ? `${addressNumber} ${streetName}` : streetName;
          
          return {
            id: f.id,
            place_name: f.place_name,
            text: displayText,
          };
        }));
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Autocomplete error:", error);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      searchSuggestions(newValue);
    }, 300);
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    onChange(suggestion.place_name);
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && <label className={`text-sm font-medium ${labelClassName}`}>{label}</label>}
      
      <div className="relative">
        <MapPin className={`absolute left-3 top-3 h-4 w-4 ${iconColor} z-10`} />
        <Input
          placeholder={placeholder}
          className={`pl-9 h-11 ${inputClassName}`}
          value={query || value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          data-testid={testId}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-start gap-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors"
                onClick={() => handleSuggestionClick(suggestion)}
                data-testid={`${testId}-suggestion-${index}`}
              >
                <Search className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                    {suggestion.text}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.place_name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {value && !query && (
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {value}
        </p>
      )}
    </div>
  );
}
