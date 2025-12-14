import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2 } from "lucide-react";

interface PostcodeSearchProps {
  value: string;
  onChange: (value: string, lat?: number, lon?: number) => void;
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  iconColor?: string;
  inputClassName?: string;
  buttonClassName?: string;
  textClassName?: string;
  testId?: string;
  showLocationPulse?: boolean;
  isCurrentLocation?: boolean;
}

interface Suggestion {
  id: string;
  address: string;
  position: {
    lat: number;
    lon: number;
  };
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
  showLocationPulse = false,
  isCurrentLocation = false,
}: PostcodeSearchProps) {
  const showPulse = showLocationPulse || isCurrentLocation;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/azure-maps/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        setSuggestions(data.results);
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
    onChange(suggestion.address, suggestion.position.lat, suggestion.position.lon);
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
        {showPulse ? (
          <div className="absolute left-3 top-3 z-10">
            <div className="relative h-6 w-6 flex items-center justify-center">
              <div className="absolute h-6 w-6 rounded-full bg-sky-400/30 animate-ripple-slow" />
              <div className="absolute h-5 w-5 rounded-full bg-sky-400/50 animate-ripple-slow animation-delay-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-sky-500 border-2 border-white shadow-sm" />
            </div>
          </div>
        ) : (
          <MapPin className={`absolute left-3 top-3 h-4 w-4 ${iconColor} z-10`} />
        )}
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
                    {suggestion.address}
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
