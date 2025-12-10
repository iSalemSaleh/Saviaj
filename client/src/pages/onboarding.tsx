import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  User, 
  Car, 
  Upload, 
  Shield, 
  Loader2, 
  CheckCircle,
  FileText,
  AlertCircle
} from "lucide-react";
import atlasRideLogo from "@assets/AtlasRide_Logo_Design_1765317206292.png";

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isDriver, setIsDriver] = useState(false);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const completeProfileMutation = useMutation({
    mutationFn: async (data: { 
      firstName: string; 
      lastName: string; 
      isDriver: boolean; 
      driverLicenseUrl?: string;
    }) => {
      const response = await apiRequest("POST", "/api/user/complete-profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile Complete!",
        description: isDriver 
          ? "Your profile is set up. Your driver's license is pending verification."
          : "Your profile is set up. You can now request rides!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete profile",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload an image smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload an image (JPG, PNG) or PDF",
          variant: "destructive",
        });
        return;
      }

      setLicenseFile(file);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setLicensePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setLicensePreview(null);
      }
    }
  };

  const uploadLicense = async (): Promise<string | null> => {
    if (!licenseFile) return null;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('license', licenseFile);

      const response = await fetch('/api/user/upload-license', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload license');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload driver's license. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your first and last name",
        variant: "destructive",
      });
      return;
    }

    if (isDriver && !licenseFile) {
      toast({
        title: "Driver's License Required",
        description: "To register as a driver, please upload your driver's license",
        variant: "destructive",
      });
      return;
    }

    let licenseUrl: string | undefined;
    if (isDriver && licenseFile) {
      const uploadedUrl = await uploadLicense();
      if (!uploadedUrl) return;
      licenseUrl = uploadedUrl;
    }

    completeProfileMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      isDriver,
      driverLicenseUrl: licenseUrl,
    });
  };

  const isSubmitting = isUploading || completeProfileMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-lg border-none shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-2">
            <img 
              src={atlasRideLogo} 
              alt="AtlasRide" 
              className="h-16 w-16 object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">Complete Your Profile</CardTitle>
          <CardDescription>
            Tell us a bit about yourself to get started
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    placeholder="John"
                    className="pl-9"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    data-testid="input-first-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Smith"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  data-testid="input-last-name"
                />
              </div>
            </div>

            {/* Driver Checkbox */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="isDriver"
                  checked={isDriver}
                  onCheckedChange={(checked) => setIsDriver(checked as boolean)}
                  className="mt-1"
                  data-testid="checkbox-driver"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="isDriver"
                    className="font-medium cursor-pointer flex items-center gap-2"
                  >
                    <Car className="h-4 w-4 text-primary" />
                    Register as a Driver
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Earn money by offering rides to others. You'll need to verify your driver's license.
                  </p>
                </div>
              </div>
            </div>

            {/* Driver License Upload - Only shown if isDriver is checked */}
            {isDriver && (
              <div className="space-y-4 p-4 rounded-lg border border-primary/20 bg-primary/5 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-primary">
                  <Shield className="h-5 w-5" />
                  <h3 className="font-semibold">Driver Verification (KYC)</h3>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Upload a clear photo of your valid UK driver's license. Both sides if applicable.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="license">Driver's License</Label>
                  <div className="relative">
                    <input
                      type="file"
                      id="license"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-license-file"
                    />
                    <label
                      htmlFor="license"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      {licensePreview ? (
                        <img 
                          src={licensePreview} 
                          alt="License preview" 
                          className="h-full object-contain rounded"
                        />
                      ) : licenseFile ? (
                        <div className="flex flex-col items-center text-primary">
                          <FileText className="h-10 w-10 mb-2" />
                          <span className="text-sm font-medium">{licenseFile.name}</span>
                          <span className="text-xs text-muted-foreground">Click to change</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Upload className="h-10 w-10 mb-2" />
                          <span className="text-sm font-medium">Click to upload</span>
                          <span className="text-xs">JPG, PNG or PDF (max 10MB)</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Your license will be reviewed within 24-48 hours. You can browse offers while waiting for verification.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 text-lg shadow-lg"
              disabled={isSubmitting}
              data-testid="button-complete-profile"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {isUploading ? "Uploading..." : "Saving..."}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Complete Profile
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You can update your profile and driver status anytime in settings.
            </p>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
