import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, Car, User, Eye, EyeOff, Upload, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import atlasRideLogo from "@assets/AtlasRide_Logo_Design_1765317206292.png";

type AccountType = "rider" | "driver";

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  homeAddress: string;
  city: string;
  postcode: string;
  accountType: AccountType;
  driverLicenseUrl: string;
  driverLicenseNumber: string;
  driverLicenseExpiry: string;
  backgroundCheckConsent: boolean;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  vehicleRegistration: string;
  vehicleInsuranceExpiry: string;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;
}

const initialFormData: FormData = {
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  phoneNumber: "",
  homeAddress: "",
  city: "",
  postcode: "",
  accountType: "rider",
  driverLicenseUrl: "",
  driverLicenseNumber: "",
  driverLicenseExpiry: "",
  backgroundCheckConsent: false,
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vehicleColor: "",
  vehicleRegistration: "",
  vehicleInsuranceExpiry: "",
  bankAccountName: "",
  bankSortCode: "",
  bankAccountNumber: "",
};

export default function Signup() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  useEffect(() => {
    const verifiedPhone = localStorage.getItem('atlasride_verified_phone');
    if (verifiedPhone) {
      setFormData(prev => ({ ...prev, phoneNumber: verifiedPhone }));
      setIsPhoneVerified(true);
    }
  }, []);

  const totalSteps = formData.accountType === "driver" ? 5 : 3;
  const progress = (step / totalSteps) * 100;

  const registerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/auth/register", {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.phoneNumber,
        homeAddress: data.homeAddress,
        city: data.city,
        postcode: data.postcode,
        isDriver: data.accountType === "driver",
        driverLicenseUrl: data.driverLicenseUrl,
        driverLicenseNumber: data.driverLicenseNumber,
        driverLicenseExpiry: data.driverLicenseExpiry,
        backgroundCheckConsent: data.backgroundCheckConsent,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        vehicleColor: data.vehicleColor,
        vehicleRegistration: data.vehicleRegistration,
        vehicleInsuranceExpiry: data.vehicleInsuranceExpiry,
        bankAccountName: data.bankAccountName,
        bankSortCode: data.bankSortCode,
        bankAccountNumber: data.bankAccountNumber,
      });
      return response;
    },
    onSuccess: () => {
      localStorage.removeItem('atlasride_signup');
      localStorage.removeItem('atlasride_verified_phone');
      localStorage.removeItem('atlasride_phone_token');
      window.location.href = "/";
    },
    onError: (error: any) => {
      setError(error.message || "Registration failed. Please try again.");
    },
  });

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("license", file);

      // Use registration-specific endpoint (no auth required)
      const response = await fetch("/api/registration/upload-license", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      handleChange("driverLicenseUrl", data.url);
    } catch (err) {
      setError("Failed to upload license. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const validateStep = () => {
    switch (step) {
      case 1:
        if (!formData.accountType) {
          setError("Please select an account type");
          return false;
        }
        return true;
      case 2:
        if (!formData.email || !formData.password || !formData.confirmPassword) {
          setError("Please fill in all fields");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setError("Please enter a valid email address");
          return false;
        }
        if (formData.password.length < 8) {
          setError("Password must be at least 8 characters");
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          setError("Passwords do not match");
          return false;
        }
        return true;
      case 3:
        if (!formData.firstName || !formData.lastName || !formData.dateOfBirth || !formData.phoneNumber) {
          setError("Please fill in all required fields");
          return false;
        }
        return true;
      case 4:
        if (formData.accountType === "driver") {
          if (!formData.driverLicenseNumber || !formData.driverLicenseExpiry || !formData.backgroundCheckConsent) {
            setError("Please complete all driver verification fields");
            return false;
          }
          if (!formData.vehicleMake || !formData.vehicleModel || !formData.vehicleRegistration) {
            setError("Please complete all vehicle information");
            return false;
          }
        }
        return true;
      case 5:
        if (formData.accountType === "driver") {
          if (!formData.bankAccountName || !formData.bankSortCode || !formData.bankAccountNumber) {
            setError("Please complete all payment details");
            return false;
          }
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step === totalSteps) {
        registerMutation.mutate(formData);
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError("");
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Choose Your Account Type</h2>
              <p className="text-muted-foreground">How would you like to use AtlasRide?</p>
            </div>

            <RadioGroup
              value={formData.accountType}
              onValueChange={(value) => handleChange("accountType", value as AccountType)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <Label
                htmlFor="rider"
                className={`flex flex-col items-center p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  formData.accountType === "rider"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="rider" id="rider" className="sr-only" />
                <User className="h-12 w-12 mb-4 text-primary" />
                <span className="text-lg font-semibold">Rider</span>
                <span className="text-sm text-muted-foreground text-center mt-2">
                  Find rides and post trip requests
                </span>
              </Label>

              <Label
                htmlFor="driver"
                className={`flex flex-col items-center p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  formData.accountType === "driver"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="driver" id="driver" className="sr-only" />
                <Car className="h-12 w-12 mb-4 text-secondary" />
                <span className="text-lg font-semibold">Driver</span>
                <span className="text-sm text-muted-foreground text-center mt-2">
                  Share your routes and earn money
                </span>
              </Label>
            </RadioGroup>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Create Your Account</h2>
              <p className="text-muted-foreground">Enter your email and create a password</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange("confirmPassword", e.target.value)}
                  data-testid="input-confirm-password"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
              <p className="text-muted-foreground">Tell us a bit about yourself</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                  data-testid="input-dob"
                />
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
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+44 7XXX XXXXXX"
                  value={formData.phoneNumber}
                  onChange={(e) => handleChange("phoneNumber", e.target.value)}
                  disabled={isPhoneVerified}
                  className={isPhoneVerified ? "bg-muted" : ""}
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="homeAddress">Home Address</Label>
                <Input
                  id="homeAddress"
                  placeholder="123 Main Street"
                  value={formData.homeAddress}
                  onChange={(e) => handleChange("homeAddress", e.target.value)}
                  data-testid="input-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="London"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    placeholder="SW1A 1AA"
                    value={formData.postcode}
                    onChange={(e) => handleChange("postcode", e.target.value)}
                    data-testid="input-postcode"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        if (formData.accountType !== "driver") return null;
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Driver Verification</h2>
              <p className="text-muted-foreground">We need to verify your identity and vehicle</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="licenseUpload">Driver's License Photo</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  {formData.driverLicenseUrl ? (
                    <div className="text-green-600 flex items-center justify-center gap-2">
                      <Check className="h-5 w-5" />
                      <span>License uploaded successfully</span>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleLicenseUpload}
                        className="hidden"
                        data-testid="input-license-upload"
                      />
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {isUploading ? "Uploading..." : "Click to upload your driver's license"}
                      </p>
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driverLicenseNumber">License Number *</Label>
                  <Input
                    id="driverLicenseNumber"
                    placeholder="ABCDE123456AB1AB"
                    value={formData.driverLicenseNumber}
                    onChange={(e) => handleChange("driverLicenseNumber", e.target.value)}
                    data-testid="input-license-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driverLicenseExpiry">License Expiry *</Label>
                  <Input
                    id="driverLicenseExpiry"
                    type="date"
                    value={formData.driverLicenseExpiry}
                    onChange={(e) => handleChange("driverLicenseExpiry", e.target.value)}
                    data-testid="input-license-expiry"
                  />
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-4">Vehicle Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleMake">Make *</Label>
                    <Input
                      id="vehicleMake"
                      placeholder="Toyota"
                      value={formData.vehicleMake}
                      onChange={(e) => handleChange("vehicleMake", e.target.value)}
                      data-testid="input-vehicle-make"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleModel">Model *</Label>
                    <Input
                      id="vehicleModel"
                      placeholder="Prius"
                      value={formData.vehicleModel}
                      onChange={(e) => handleChange("vehicleModel", e.target.value)}
                      data-testid="input-vehicle-model"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleYear">Year</Label>
                    <Input
                      id="vehicleYear"
                      placeholder="2022"
                      value={formData.vehicleYear}
                      onChange={(e) => handleChange("vehicleYear", e.target.value)}
                      data-testid="input-vehicle-year"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleColor">Color</Label>
                    <Input
                      id="vehicleColor"
                      placeholder="Silver"
                      value={formData.vehicleColor}
                      onChange={(e) => handleChange("vehicleColor", e.target.value)}
                      data-testid="input-vehicle-color"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleRegistration">Registration *</Label>
                    <Input
                      id="vehicleRegistration"
                      placeholder="AB12 CDE"
                      value={formData.vehicleRegistration}
                      onChange={(e) => handleChange("vehicleRegistration", e.target.value)}
                      data-testid="input-vehicle-reg"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Label htmlFor="vehicleInsuranceExpiry">Insurance Expiry</Label>
                  <Input
                    id="vehicleInsuranceExpiry"
                    type="date"
                    value={formData.vehicleInsuranceExpiry}
                    onChange={(e) => handleChange("vehicleInsuranceExpiry", e.target.value)}
                    data-testid="input-insurance-expiry"
                  />
                </div>
              </div>

              <div className="flex items-start space-x-2 mt-4 p-4 bg-muted/50 rounded-lg">
                <Checkbox
                  id="backgroundCheck"
                  checked={formData.backgroundCheckConsent}
                  onCheckedChange={(checked) => handleChange("backgroundCheckConsent", checked as boolean)}
                  data-testid="checkbox-background-check"
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="backgroundCheck"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Background Check Consent *
                  </label>
                  <p className="text-sm text-muted-foreground">
                    I consent to a background check for driver verification purposes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        if (formData.accountType !== "driver") return null;
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Payment Details</h2>
              <p className="text-muted-foreground">Enter your bank details to receive payments</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bankAccountName">Account Holder Name *</Label>
                <Input
                  id="bankAccountName"
                  placeholder="John Doe"
                  value={formData.bankAccountName}
                  onChange={(e) => handleChange("bankAccountName", e.target.value)}
                  data-testid="input-bank-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankSortCode">Sort Code *</Label>
                <Input
                  id="bankSortCode"
                  placeholder="12-34-56"
                  value={formData.bankSortCode}
                  onChange={(e) => handleChange("bankSortCode", e.target.value)}
                  data-testid="input-sort-code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankAccountNumber">Account Number *</Label>
                <Input
                  id="bankAccountNumber"
                  placeholder="12345678"
                  value={formData.bankAccountNumber}
                  onChange={(e) => handleChange("bankAccountNumber", e.target.value)}
                  data-testid="input-account-number"
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-lg mt-4">
                <p className="text-sm text-blue-800">
                  Your payment details are securely encrypted and will only be used to transfer earnings from completed rides.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center gap-2">
          <img src={atlasRideLogo} alt="AtlasRide" className="h-8 w-8" />
          <span className="font-bold text-lg text-primary">AtlasRide</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="mb-4">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Step {step} of {totalSteps}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            {renderStep()}

            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={step === 1}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={registerMutation.isPending}
                data-testid="button-next"
              >
                {registerMutation.isPending ? (
                  "Creating account..."
                ) : step === totalSteps ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Account
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                onClick={() => setLocation("/login")}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
