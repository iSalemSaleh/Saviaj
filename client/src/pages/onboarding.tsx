import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  User, 
  Car, 
  Upload, 
  Shield, 
  Loader2, 
  CheckCircle,
  FileText,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Building,
  Palette,
  Hash
} from "lucide-react";
import atlasRideLogo from "@assets/AtlasRideLogo_1767128702037.png";

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      localStorage.setItem('atlasride_signup', 'true');
      window.location.href = '/api/login';
    }
  }, [authLoading, isAuthenticated]);

  // Personal Information
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  // Auto-populate verified phone number from registration
  useEffect(() => {
    const verifiedPhone = localStorage.getItem('atlasride_verified_phone');
    if (verifiedPhone) {
      setPhoneNumber(verifiedPhone);
      setIsPhoneVerified(true);
    }
  }, []);
  const [homeAddress, setHomeAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  // Driver Registration
  const [isDriver, setIsDriver] = useState(false);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState("");
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);

  // Vehicle Information
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [vehicleInsuranceExpiry, setVehicleInsuranceExpiry] = useState("");

  // Payment Information
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  const [isUploading, setIsUploading] = useState(false);

  const completeProfileMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const response = await apiRequest("POST", "/api/user/complete-profile", data);
      return response.json();
    },
    onSuccess: () => {
      localStorage.removeItem('atlasride_signup');
      localStorage.removeItem('atlasride_verified_phone');
      localStorage.removeItem('atlasride_phone_token');
      toast({
        title: "Profile Complete!",
        description: isDriver 
          ? "Your profile is set up. Your driver application is pending verification."
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

    if (!dateOfBirth) {
      toast({
        title: "Missing Information",
        description: "Please enter your date of birth",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }

    if (isDriver) {
      if (!licenseFile) {
        toast({
          title: "Driver's License Required",
          description: "To register as a driver, please upload your driver's license",
          variant: "destructive",
        });
        return;
      }

      if (!driverLicenseNumber.trim() || !driverLicenseExpiry) {
        toast({
          title: "License Information Required",
          description: "Please enter your license number and expiry date",
          variant: "destructive",
        });
        return;
      }

      if (!backgroundCheckConsent) {
        toast({
          title: "Background Check Required",
          description: "You must consent to a background check to register as a driver",
          variant: "destructive",
        });
        return;
      }

      if (!vehicleMake.trim() || !vehicleModel.trim() || !vehicleRegistration.trim()) {
        toast({
          title: "Vehicle Information Required",
          description: "Please enter your vehicle details",
          variant: "destructive",
        });
        return;
      }

      if (!bankAccountName.trim() || !bankSortCode.trim() || !bankAccountNumber.trim()) {
        toast({
          title: "Payment Information Required",
          description: "Please enter your bank details to receive payments",
          variant: "destructive",
        });
        return;
      }
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
      dateOfBirth,
      phoneNumber: phoneNumber.trim(),
      homeAddress: homeAddress.trim(),
      city: city.trim(),
      postcode: postcode.trim(),
      isDriver,
      driverLicenseUrl: licenseUrl,
      driverLicenseNumber: driverLicenseNumber.trim(),
      driverLicenseExpiry,
      backgroundCheckConsent,
      vehicleMake: vehicleMake.trim(),
      vehicleModel: vehicleModel.trim(),
      vehicleYear: vehicleYear.trim(),
      vehicleColor: vehicleColor.trim(),
      vehicleRegistration: vehicleRegistration.trim(),
      vehicleInsuranceExpiry,
      bankAccountName: bankAccountName.trim(),
      bankSortCode: bankSortCode.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
    });
  };

  const isSubmitting = isUploading || completeProfileMutation.isPending;

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 py-8">
      <Card className="w-full max-w-2xl border-none shadow-2xl">
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
            Tell us about yourself to get started with AtlasRide
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Information
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="dateOfBirth"
                      type="date"
                      className="pl-9"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      data-testid="input-date-of-birth"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                    Phone Number *
                    {isPhoneVerified && (
                      <span className="text-green-600 text-xs flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="+44 7700 900000"
                      className={`pl-9 ${isPhoneVerified ? "bg-muted" : ""}`}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={isPhoneVerified}
                      data-testid="input-phone-number"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="homeAddress">Home Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="homeAddress"
                    placeholder="123 Main Street"
                    className="pl-9"
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    data-testid="input-home-address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="London"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    placeholder="SW1A 1AA"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    data-testid="input-postcode"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Driver Registration Checkbox */}
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
                    I want to register as a Driver
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Earn money by offering rides to others. Additional verification required.
                  </p>
                </div>
              </div>
            </div>

            {/* Driver-specific fields - Only shown if isDriver is checked */}
            {isDriver && (
              <div className="space-y-6 animate-in slide-in-from-top-2">
                {/* License & Background Check Section */}
                <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Shield className="h-5 w-5" />
                    <h3 className="font-semibold">Driver Verification & Background Check</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="driverLicenseNumber">License Number *</Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="driverLicenseNumber"
                          placeholder="SMITH901234AB1CD"
                          className="pl-9"
                          value={driverLicenseNumber}
                          onChange={(e) => setDriverLicenseNumber(e.target.value)}
                          data-testid="input-license-number"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driverLicenseExpiry">License Expiry *</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="driverLicenseExpiry"
                          type="date"
                          className="pl-9"
                          value={driverLicenseExpiry}
                          onChange={(e) => setDriverLicenseExpiry(e.target.value)}
                          data-testid="input-license-expiry"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="license">Upload Driver's License *</Label>
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

                  <div className="flex items-start space-x-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <Checkbox
                      id="backgroundCheck"
                      checked={backgroundCheckConsent}
                      onCheckedChange={(checked) => setBackgroundCheckConsent(checked as boolean)}
                      className="mt-1"
                      data-testid="checkbox-background-check"
                    />
                    <div className="space-y-1">
                      <label htmlFor="backgroundCheck" className="font-medium cursor-pointer text-sm">
                        I consent to a background check *
                      </label>
                      <p className="text-xs text-muted-foreground">
                        By checking this box, you authorize AtlasRide to conduct a background verification including criminal record and driving history checks.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vehicle Information Section */}
                <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 space-y-4">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Car className="h-5 w-5" />
                    <h3 className="font-semibold">Vehicle Information</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicleMake">Make *</Label>
                      <Input
                        id="vehicleMake"
                        placeholder="Toyota"
                        value={vehicleMake}
                        onChange={(e) => setVehicleMake(e.target.value)}
                        data-testid="input-vehicle-make"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleModel">Model *</Label>
                      <Input
                        id="vehicleModel"
                        placeholder="Camry"
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        data-testid="input-vehicle-model"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicleYear">Year</Label>
                      <Input
                        id="vehicleYear"
                        placeholder="2022"
                        value={vehicleYear}
                        onChange={(e) => setVehicleYear(e.target.value)}
                        data-testid="input-vehicle-year"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleColor">Color</Label>
                      <div className="relative">
                        <Palette className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="vehicleColor"
                          placeholder="Silver"
                          className="pl-9"
                          value={vehicleColor}
                          onChange={(e) => setVehicleColor(e.target.value)}
                          data-testid="input-vehicle-color"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleRegistration">Registration *</Label>
                      <Input
                        id="vehicleRegistration"
                        placeholder="AB12 CDE"
                        value={vehicleRegistration}
                        onChange={(e) => setVehicleRegistration(e.target.value)}
                        data-testid="input-vehicle-registration"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vehicleInsuranceExpiry">Insurance Expiry Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="vehicleInsuranceExpiry"
                        type="date"
                        className="pl-9"
                        value={vehicleInsuranceExpiry}
                        onChange={(e) => setVehicleInsuranceExpiry(e.target.value)}
                        data-testid="input-insurance-expiry"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Information Section */}
                <div className="p-4 rounded-lg border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20 space-y-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CreditCard className="h-5 w-5" />
                    <h3 className="font-semibold">Payment Details (for receiving payments)</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bankAccountName">Account Holder Name *</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="bankAccountName"
                        placeholder="John Smith"
                        className="pl-9"
                        value={bankAccountName}
                        onChange={(e) => setBankAccountName(e.target.value)}
                        data-testid="input-bank-account-name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bankSortCode">Sort Code *</Label>
                      <Input
                        id="bankSortCode"
                        placeholder="00-00-00"
                        value={bankSortCode}
                        onChange={(e) => setBankSortCode(e.target.value)}
                        data-testid="input-sort-code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bankAccountNumber">Account Number *</Label>
                      <Input
                        id="bankAccountNumber"
                        placeholder="12345678"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        data-testid="input-account-number"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-green-700 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Your bank details are securely encrypted and will only be used to transfer your earnings.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Your driver application will be reviewed within 24-48 hours. You can browse ride requests while waiting for verification.
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
                  {isDriver ? "Submit Driver Application" : "Complete Profile"}
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
