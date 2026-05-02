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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Car, User, Eye, EyeOff, Upload, CheckCircle, Camera, Briefcase, Shield, Mail, Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import atlasRideLogo from "@assets/AtlasRideLogo_1767134626458.png";
import { EmailVerificationModal } from "@/components/EmailVerificationModal";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";
import { ukCityNames } from "@shared/data/uk-cities";
import { ukCouncilNames } from "@shared/data/uk-councils";

type AccountType = "rider" | "driver";

interface FormData {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  homeAddress: string;
  city: string;
  postcode: string;
  profileImageUrl: string;
  accountType: AccountType;
  driverLicenseUrl: string;
  driverLicenseNumber: string;
  driverLicenseExpiry: string;
  backgroundCheckConsent: boolean;
  taxSelfEmploymentAcknowledged: boolean;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  vehicleRegistration: string;
  vehicleInsuranceExpiry: string;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;
  // Commercial driver (Pro Account) fields
  isCommercialDriver: boolean;
  privateHireLicenseUrl: string;
  privateHireLicenseNumber: string;
  dvlaCheckCode: string;
  commercialInsuranceUrl: string;
  commercialInsuranceExpiry: string;
  vehicleInspectionUrl: string;
  vehicleInspectionExpiry: string;
  phvLicenseUrl: string;
  phvLicenseNumber: string;
  phvLicenseExpiry: string;
  // Local Licensing Authority that issues this driver's PHV / taxi
  // licence — required when isCommercialDriver is true.
  licensingCouncil: string;
  // Legal acceptance
  acceptedLegal: boolean;
}

const initialFormData: FormData = {
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  phoneNumber: "",
  homeAddress: "",
  city: "",
  postcode: "",
  profileImageUrl: "",
  accountType: "rider",
  driverLicenseUrl: "",
  driverLicenseNumber: "",
  driverLicenseExpiry: "",
  backgroundCheckConsent: false,
  taxSelfEmploymentAcknowledged: false,
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vehicleColor: "",
  vehicleRegistration: "",
  vehicleInsuranceExpiry: "",
  bankAccountName: "",
  bankSortCode: "",
  bankAccountNumber: "",
  isCommercialDriver: false,
  privateHireLicenseUrl: "",
  privateHireLicenseNumber: "",
  dvlaCheckCode: "",
  commercialInsuranceUrl: "",
  commercialInsuranceExpiry: "",
  vehicleInspectionUrl: "",
  vehicleInspectionExpiry: "",
  phvLicenseUrl: "",
  phvLicenseNumber: "",
  phvLicenseExpiry: "",
  licensingCouncil: "",
  acceptedLegal: false,
};

export default function Signup() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [isLookingUpPostcode, setIsLookingUpPostcode] = useState(false);
  const [postcodeLookupHint, setPostcodeLookupHint] = useState<string>("");

  // Postcode → city autofill via /api/lookup/postcode/:postcode (proxies
  // postcodes.io). On success we map the upstream `admin_district` to the
  // closest entry in our curated UK city dropdown — if no exact match is
  // found we fall back to leaving the dropdown empty and just hint the
  // user about what we received.
  const handlePostcodeLookup = async () => {
    const compact = formData.postcode.replace(/\s+/g, "").toUpperCase();
    if (!compact) return;
    setIsLookingUpPostcode(true);
    setPostcodeLookupHint("");
    try {
      const res = await fetch(`/api/lookup/postcode/${encodeURIComponent(compact)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        setPostcodeLookupHint(body?.message || "Postcode not found.");
        return;
      }
      const data: { city?: string; council?: string; postcode?: string } = await res.json();
      if (data.postcode) {
        handleChange("postcode", data.postcode);
      }
      const upstreamCity = (data.city || "").trim();
      // Try exact match first, then case-insensitive.
      let matched = ukCityNames.find((n) => n === upstreamCity);
      if (!matched) {
        matched = ukCityNames.find(
          (n) => n.toLowerCase() === upstreamCity.toLowerCase(),
        );
      }
      if (matched) {
        handleChange("city", matched);
        setPostcodeLookupHint(`City set to ${matched}.`);
      } else if (upstreamCity) {
        setPostcodeLookupHint(
          `Postcode area is "${upstreamCity}" — please pick the closest city below.`,
        );
      } else {
        setPostcodeLookupHint("Please pick your city below.");
      }
    } catch {
      setPostcodeLookupHint("Couldn't reach the lookup service. Please pick your city manually.");
    } finally {
      setIsLookingUpPostcode(false);
    }
  };
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUploadingCommercial, setIsUploadingCommercial] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);

  useEffect(() => {
    const verifiedEmail = localStorage.getItem('atlasride_verified_email');
    const token = localStorage.getItem('atlasride_email_token');
    const tokenTs = parseInt(localStorage.getItem('atlasride_email_token_ts') || '0', 10);
    const TOKEN_TTL_MS = 30 * 60 * 1000; // server-side expiry is 30 minutes
    const isExpired = !tokenTs || Date.now() - tokenTs > TOKEN_TTL_MS;
    if (verifiedEmail && token && !isExpired) {
      setFormData(prev => ({ ...prev, email: verifiedEmail }));
      setIsEmailVerified(true);
      setEmailVerificationToken(token);
    } else if (verifiedEmail || token) {
      // Stale token - clear it so the next user isn't pre-filled
      localStorage.removeItem('atlasride_verified_email');
      localStorage.removeItem('atlasride_email_token');
      localStorage.removeItem('atlasride_email_token_ts');
    }
  }, []);

  // Sync the wizard step with browser history so the device back button
  // moves one step back instead of dumping the whole flow.
  useEffect(() => {
    window.history.replaceState({ signupStep: 1 }, "", window.location.pathname);
    const handlePopState = (e: PopStateEvent) => {
      const target = e.state?.signupStep;
      if (typeof target === "number") {
        setStep(target);
        setError("");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Warn the user if they try to leave (refresh / close tab) past step 1.
  useEffect(() => {
    if (step === 1) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  const confirmAbandon = (target: string) => {
    if (step > 1) {
      const ok = window.confirm(
        "You'll lose the information you've entered so far. Continue?"
      );
      if (!ok) return;
    }
    // Use a hard navigation so the per-step history entries we pushed
    // don't pollute the back stack on the destination page.
    window.location.href = target;
  };

  const totalSteps = formData.accountType === "driver" ? 6 : 3;
  const progress = (step / totalSteps) * 100;

  const registerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!emailVerificationToken) {
        throw new Error("Email verification is required");
      }
      const response = await apiRequest("POST", "/api/auth/register", {
        email: data.email,
        emailVerificationToken: emailVerificationToken,
        acceptedLegal: data.acceptedLegal,
        username: data.username || undefined,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.phoneNumber,
        homeAddress: data.homeAddress,
        city: data.city,
        postcode: data.postcode,
        licensingCouncil: data.isCommercialDriver ? data.licensingCouncil : undefined,
        profileImageUrl: data.profileImageUrl,
        isDriver: data.accountType === "driver",
        driverLicenseUrl: data.driverLicenseUrl,
        driverLicenseNumber: data.driverLicenseNumber,
        driverLicenseExpiry: data.driverLicenseExpiry,
        backgroundCheckConsent: data.backgroundCheckConsent,
        taxSelfEmploymentAcknowledged: data.taxSelfEmploymentAcknowledged,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        vehicleColor: data.vehicleColor,
        vehicleRegistration: data.vehicleRegistration,
        vehicleInsuranceExpiry: data.vehicleInsuranceExpiry,
        bankAccountName: data.bankAccountName,
        bankSortCode: data.bankSortCode,
        bankAccountNumber: data.bankAccountNumber,
        isCommercialDriver: data.isCommercialDriver,
        privateHireLicenseUrl: data.privateHireLicenseUrl,
        privateHireLicenseNumber: data.privateHireLicenseNumber,
        dvlaCheckCode: data.dvlaCheckCode,
        commercialInsuranceUrl: data.commercialInsuranceUrl,
        commercialInsuranceExpiry: data.commercialInsuranceExpiry,
        vehicleInspectionUrl: data.vehicleInspectionUrl,
        vehicleInspectionExpiry: data.vehicleInspectionExpiry,
        phvLicenseUrl: data.phvLicenseUrl,
        phvLicenseNumber: data.phvLicenseNumber,
        phvLicenseExpiry: data.phvLicenseExpiry,
      });
      return response;
    },
    onSuccess: () => {
      localStorage.removeItem('atlasride_signup');
      localStorage.removeItem('atlasride_verified_email');
      localStorage.removeItem('atlasride_email_token');
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

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setError("");
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("profileImage", file);

      const response = await fetch("/api/registration/upload-profile", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Upload failed");
      }

      const data = await response.json();
      handleChange("profileImageUrl", data.url);
    } catch (err: any) {
      console.error("Profile photo upload error:", err);
      setError(err.message || "Failed to upload profile photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleCommercialDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof FormData) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCommercial(field);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("license", file);

      const response = await fetch("/api/registration/upload-license", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      handleChange(field, data.url);
    } catch (err) {
      setError("Failed to upload document. Please try again.");
    } finally {
      setIsUploadingCommercial(null);
    }
  };

  const validateStep = () => {
    switch (step) {
      case 1:
        if (!formData.email || !formData.password || !formData.confirmPassword) {
          setError("Please fill in all fields");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setError("Please enter a valid email address");
          return false;
        }
        if (!isEmailVerified) {
          setError("Please verify your email address before continuing");
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
      case 2:
        if (!formData.accountType) {
          setError("Please select an account type");
          return false;
        }
        return true;
      case 3:
        if (!formData.firstName || !formData.lastName || !formData.dateOfBirth) {
          setError("Please fill in all required fields");
          return false;
        }
        if (!formData.city) {
          // City is required so we can issue a meaningful Saviaj Pass ID.
          setError("Please select your city — try the postcode lookup or pick from the list");
          return false;
        }
        if (formData.accountType === "driver" && !formData.profileImageUrl) {
          setError("Profile photo is required for drivers");
          return false;
        }
        return true;
      case 4:
        if (formData.accountType === "driver") {
          if (!formData.taxSelfEmploymentAcknowledged) {
            setError("Please acknowledge the self-employment / tax notice before continuing.");
            return false;
          }
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
      case 6:
        // Pro Account section is optional, BUT once the user opts in
        // they must declare a licensing council so the booking layer can
        // cross-check their PHV plate at trip time.
        if (formData.isCommercialDriver && !formData.licensingCouncil) {
          setError("Please select your Local Licensing Authority (council)");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step === totalSteps) {
        if (!formData.acceptedLegal) {
          setError(
            "Please accept the Terms of Service, Privacy Policy, Refund Policy and Cancellation Policy to create your account.",
          );
          return;
        }
        registerMutation.mutate(formData);
      } else {
        const next = step + 1;
        window.history.pushState({ signupStep: next }, "", window.location.pathname);
        setStep(next);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      window.history.back();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Create Your Account</h2>
              <p className="text-muted-foreground">Verify your email and create a password</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  Email Address *
                  {isEmailVerified && (
                    <span className="text-green-600 text-xs flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => {
                      handleChange("email", e.target.value);
                      if (isEmailVerified) {
                        setIsEmailVerified(false);
                        setEmailVerificationToken(null);
                        localStorage.removeItem('atlasride_verified_email');
                        localStorage.removeItem('atlasride_email_token');
                      }
                    }}
                    className={isEmailVerified ? "bg-green-50 border-green-300" : ""}
                    data-testid="input-email"
                  />
                  {!isEmailVerified && formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowEmailVerificationModal(true)}
                      className="shrink-0"
                      data-testid="button-verify-email"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Verify
                    </Button>
                  )}
                </div>
                {!isEmailVerified && (
                  <p className="text-xs text-muted-foreground">
                    You'll need to verify your email before continuing
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username (Optional)</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Choose a username (3-30 characters)"
                  value={formData.username}
                  onChange={(e) => handleChange("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  data-testid="input-username"
                />
                <p className="text-xs text-muted-foreground">
                  You can use this to log in instead of your email. Letters, numbers, and underscores only.
                </p>
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

      case 2:
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

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
              <p className="text-muted-foreground">Tell us a bit about yourself</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
                <CountryPhoneInput
                  value={formData.phoneNumber}
                  onChange={(value) => handleChange("phoneNumber", value)}
                  defaultCountry="GB"
                  placeholder="7XXX XXXXXX"
                />
              </div>

              {/* Postcode-first address block. The "Find my address"
                  button hits /api/lookup/postcode/:postcode which proxies
                  postcodes.io and returns city + council. We pre-select
                  the city in the dropdown below so the user just has to
                  confirm it. The dropdown remains the source of truth
                  for the `city` field — the postcode value is optional
                  and stored as-is. */}
              <div className="space-y-2">
                <Label htmlFor="postcode">Postcode</Label>
                <div className="flex gap-2">
                  <Input
                    id="postcode"
                    placeholder="SW1A 1AA"
                    value={formData.postcode}
                    onChange={(e) => handleChange("postcode", e.target.value.toUpperCase())}
                    data-testid="input-postcode"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePostcodeLookup}
                    disabled={isLookingUpPostcode || !formData.postcode}
                    data-testid="button-postcode-lookup"
                  >
                    {isLookingUpPostcode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Find my city</span>
                  </Button>
                </div>
                {postcodeLookupHint && (
                  <p className="text-xs text-muted-foreground" data-testid="text-postcode-hint">
                    {postcodeLookupHint}
                  </p>
                )}
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

              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Select
                  value={formData.city}
                  onValueChange={(value) => handleChange("city", value)}
                >
                  <SelectTrigger id="city" data-testid="select-city">
                    <SelectValue placeholder="Select your city" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ukCityNames.map((name) => (
                      <SelectItem key={name} value={name} data-testid={`option-city-${name}`}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used to build your Saviaj Pass — your unique member ID.
                </p>
              </div>

              {/* Profile Photo - Required for drivers */}
              <div className="space-y-2">
                <Label htmlFor="profilePhoto" className="flex items-center gap-2">
                  Profile Photo {formData.accountType === "driver" && <span className="text-red-500">*</span>}
                </Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  {formData.profileImageUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img 
                        src={formData.profileImageUrl} 
                        alt="Profile" 
                        className="w-24 h-24 rounded-full object-cover border-2 border-primary"
                      />
                      <span className="text-green-600 flex items-center gap-1 text-sm">
                        <Check className="h-4 w-4" />
                        Photo uploaded
                      </span>
                      <label className="cursor-pointer text-sm text-primary hover:underline">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfilePhotoUpload}
                          className="hidden"
                        />
                        Change photo
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoUpload}
                        className="hidden"
                        data-testid="input-profile-photo"
                      />
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {isUploadingPhoto ? "Uploading..." : "Click to upload your profile photo"}
                      </p>
                      {formData.accountType === "driver" && (
                        <p className="text-xs text-amber-600 mt-1">Required for drivers</p>
                      )}
                    </label>
                  )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
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
                    I consent to an Enhanced DBS (Disclosure &amp; Barring Service) check for
                    driver verification purposes. You will be able to upload your DBS certificate
                    after signup from your Settings page.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <Checkbox
                  id="taxNotice"
                  checked={formData.taxSelfEmploymentAcknowledged}
                  onCheckedChange={(checked) => handleChange("taxSelfEmploymentAcknowledged", checked as boolean)}
                  data-testid="checkbox-tax-notice"
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="taxNotice"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Self-Employment &amp; Tax Notice *
                  </label>
                  <p className="text-sm text-muted-foreground">
                    I understand that I am driving on Saviaj as a self-employed
                    contractor, NOT an employee. I am personally responsible for
                    declaring my earnings to HMRC and for paying my own income
                    tax and National Insurance. Saviaj does not deduct PAYE on
                    my behalf. I also confirm I will hold valid Hire &amp; Reward
                    motor insurance before carrying any paying passenger.
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

      case 6:
        if (formData.accountType !== "driver") return null;
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Briefcase className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Pro Account</h2>
              </div>
              <p className="text-muted-foreground">Upgrade to Commercial Driver status (Optional)</p>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">Private Driver Limits</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Without commercial verification, you're limited to 5 rides per day and £99.99 in daily earnings.
                    Complete this section to remove these limits.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 mb-6">
              <Checkbox
                id="isCommercialDriver"
                checked={formData.isCommercialDriver}
                onCheckedChange={(checked) => handleChange("isCommercialDriver", checked as boolean)}
                data-testid="checkbox-commercial-driver"
              />
              <label
                htmlFor="isCommercialDriver"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I want to register as a Commercial Driver
              </label>
            </div>

            {formData.isCommercialDriver && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-2">
                  <Label htmlFor="licensingCouncil">Local Licensing Authority *</Label>
                  <Select
                    value={formData.licensingCouncil}
                    onValueChange={(value) => handleChange("licensingCouncil", value)}
                  >
                    <SelectTrigger id="licensingCouncil" data-testid="select-licensing-council">
                      <SelectValue placeholder="Select the council that issues your PHV / taxi licence" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {ukCouncilNames.map((name) => (
                        <SelectItem key={name} value={name} data-testid={`option-council-${name}`}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    For Greater London select <strong>Transport for London (TfL)</strong>. Elsewhere, choose your local council.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="privateHireLicense">Private Hire Driving Licence</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {formData.privateHireLicenseUrl ? (
                        <div className="text-green-600 flex items-center justify-center gap-2 text-sm">
                          <Check className="h-4 w-4" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleCommercialDocUpload(e, "privateHireLicenseUrl")}
                            className="hidden"
                          />
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {isUploadingCommercial === "privateHireLicenseUrl" ? "Uploading..." : "Upload licence"}
                          </p>
                        </label>
                      )}
                    </div>
                    <Input
                      placeholder="Licence number"
                      value={formData.privateHireLicenseNumber}
                      onChange={(e) => handleChange("privateHireLicenseNumber", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dvlaCheckCode">DVLA Electronic Counterpart Check Code</Label>
                  <Input
                    placeholder="Enter DVLA check code"
                    value={formData.dvlaCheckCode}
                    onChange={(e) => handleChange("dvlaCheckCode", e.target.value)}
                    data-testid="input-dvla-code"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Insurance Certificate (+ supporting documents)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {formData.commercialInsuranceUrl ? (
                        <div className="text-green-600 flex items-center justify-center gap-2 text-sm">
                          <Check className="h-4 w-4" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleCommercialDocUpload(e, "commercialInsuranceUrl")}
                            className="hidden"
                          />
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {isUploadingCommercial === "commercialInsuranceUrl" ? "Uploading..." : "Upload certificate"}
                          </p>
                        </label>
                      )}
                    </div>
                    <Input
                      type="date"
                      placeholder="Expiry date"
                      value={formData.commercialInsuranceExpiry}
                      onChange={(e) => handleChange("commercialInsuranceExpiry", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>UK Vehicle Inspection</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {formData.vehicleInspectionUrl ? (
                        <div className="text-green-600 flex items-center justify-center gap-2 text-sm">
                          <Check className="h-4 w-4" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleCommercialDocUpload(e, "vehicleInspectionUrl")}
                            className="hidden"
                          />
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {isUploadingCommercial === "vehicleInspectionUrl" ? "Uploading..." : "Upload inspection"}
                          </p>
                        </label>
                      )}
                    </div>
                    <Input
                      type="date"
                      placeholder="Expiry date"
                      value={formData.vehicleInspectionExpiry}
                      onChange={(e) => handleChange("vehicleInspectionExpiry", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Private Hire Vehicle Licence (PHV)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {formData.phvLicenseUrl ? (
                        <div className="text-green-600 flex items-center justify-center gap-2 text-sm">
                          <Check className="h-4 w-4" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleCommercialDocUpload(e, "phvLicenseUrl")}
                            className="hidden"
                          />
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {isUploadingCommercial === "phvLicenseUrl" ? "Uploading..." : "Upload PHV"}
                          </p>
                        </label>
                      )}
                    </div>
                    <Input
                      placeholder="PHV licence number"
                      value={formData.phvLicenseNumber}
                      onChange={(e) => handleChange("phvLicenseNumber", e.target.value)}
                    />
                    <Input
                      type="date"
                      placeholder="Expiry date"
                      value={formData.phvLicenseExpiry}
                      onChange={(e) => handleChange("phvLicenseExpiry", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {!formData.isCommercialDriver && (
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  You can skip this step and upgrade to Commercial status later from your profile.
                </p>
              </div>
            )}
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
          onClick={() => confirmAbandon("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-to-home"
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

            {step === totalSteps && (
              <div className="mt-8 p-4 rounded-lg border bg-muted/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={formData.acceptedLegal}
                    onCheckedChange={(v) =>
                      setFormData((prev) => ({ ...prev, acceptedLegal: v === true }))
                    }
                    data-testid="checkbox-accept-legal"
                    className="mt-1"
                  />
                  <span className="text-sm text-foreground/90 leading-relaxed">
                    I confirm I am 18 or older and I agree to Saviaj's{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                      data-testid="link-signup-terms"
                    >
                      Terms of Service
                    </a>
                    ,{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                      data-testid="link-signup-privacy"
                    >
                      Privacy Policy
                    </a>
                    ,{" "}
                    <a
                      href="/refund-policy"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                      data-testid="link-signup-refund"
                    >
                      Refund Policy
                    </a>
                    {" "}and{" "}
                    <a
                      href="/cancellation-policy"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                      data-testid="link-signup-cancellation"
                    >
                      Cancellation Policy
                    </a>
                    .
                  </span>
                </label>
              </div>
            )}

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
                onClick={() => confirmAbandon("/login")}
                className="text-primary hover:underline"
                data-testid="link-go-signin"
              >
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </main>

      <EmailVerificationModal
        open={showEmailVerificationModal}
        onClose={() => setShowEmailVerificationModal(false)}
        initialEmail={formData.email}
        onVerified={(verifiedEmail, token) => {
          setFormData(prev => ({ ...prev, email: verifiedEmail }));
          setIsEmailVerified(true);
          setEmailVerificationToken(token);
          localStorage.setItem('atlasride_verified_email', verifiedEmail);
          localStorage.setItem('atlasride_email_token', token);
          localStorage.setItem('atlasride_email_token_ts', String(Date.now()));
          setShowEmailVerificationModal(false);
          setError("");
        }}
      />
    </div>
  );
}
