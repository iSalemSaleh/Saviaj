import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Car, Shield, PoundSterling, Upload, Loader2, CheckCircle2, AlertCircle, Briefcase, Check, ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// UK Driving License validation (DVLA format: 16 alphanumeric characters)
function validateUkDrivingLicense(license: string): { valid: boolean; error?: string } {
  const normalized = license.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 16) {
    return { valid: false, error: "UK license must be 16 characters" };
  }
  const pattern = /^[A-Z9]{5}[0-9]{6}[A-Z0-9]{5}$/;
  if (!pattern.test(normalized)) {
    return { valid: false, error: "Invalid UK license format (e.g., MORGA753116SM9IJ)" };
  }
  return { valid: true };
}

// Insurance expiry validation (must be at least 30 days from now)
function validateInsuranceExpiry(dateStr: string): { valid: boolean; error?: string } {
  if (!dateStr) {
    return { valid: false, error: "Insurance expiry date is required" };
  }
  const expiryDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 30);
  
  if (expiryDate < minDate) {
    return { valid: false, error: "Insurance must be valid for at least 30 days" };
  }
  return { valid: true };
}

// UK Sort Code validation (6 digits, accepts XX-XX-XX or XXXXXX format)
function validateUkSortCode(sortCode: string): { valid: boolean; error?: string; formatted?: string } {
  const digitsOnly = sortCode.replace(/\D/g, '');
  if (digitsOnly.length !== 6) {
    return { valid: false, error: "Sort code must be 6 digits (e.g., 12-34-56)" };
  }
  const formatted = `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2, 4)}-${digitsOnly.slice(4, 6)}`;
  return { valid: true, formatted };
}

// UK Bank Account Number validation (exactly 8 digits)
function validateUkAccountNumber(accountNumber: string): { valid: boolean; error?: string } {
  const digitsOnly = accountNumber.replace(/\D/g, '');
  if (digitsOnly.length !== 8) {
    return { valid: false, error: "Account number must be 8 digits" };
  }
  return { valid: true };
}

export default function BecomeDriverPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Check for upgrade=pro query parameter (private driver upgrading to commercial)
  const urlParams = new URLSearchParams(window.location.search);
  const isProUpgrade = urlParams.get('upgrade') === 'pro';
  const isPrivateDriver = (user as any)?.isDriver && !(user as any)?.isCommercialDriver;

  // Determine starting step based on context
  const hasProfilePicture = !!(user as any)?.profileImageUrl;
  // If upgrading to pro, start at step 6 (commercial driver step)
  // Otherwise, start at step 3 or 4 based on profile picture
  const getStartingStep = () => {
    if (isProUpgrade && isPrivateDriver) return 6;
    return hasProfilePicture ? 4 : 3;
  };
  const [step, setStep] = useState(getStartingStep);
  const totalSteps = 6;

  useEffect(() => {
    // If already a driver and NOT doing pro upgrade, redirect to driver page
    if ((user as any)?.isDriver && !isProUpgrade) {
      navigate("/driver");
    }
    // If already a commercial driver, redirect to driver page
    if ((user as any)?.isCommercialDriver) {
      navigate("/driver");
    }
  }, [user, navigate, isProUpgrade]);

  // Update starting step when user data loads
  useEffect(() => {
    if (user) {
      if (isProUpgrade && isPrivateDriver) {
        setStep(6);
      } else {
        const hasPic = !!(user as any)?.profileImageUrl;
        setStep(hasPic ? 4 : 3);
      }
    }
  }, [user, isProUpgrade, isPrivateDriver]);

  // Profile photo state
  const [profileImageUrl, setProfileImageUrl] = useState((user as any)?.profileImageUrl || "");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // License & vehicle info (Step 4)
  const [driverLicenseUrl, setDriverLicenseUrl] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState("");
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  // Insurance & bank details (Step 5)
  const [vehicleInsuranceExpiry, setVehicleInsuranceExpiry] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingCommercial, setIsUploadingCommercial] = useState<string | null>(null);

  // Commercial driver fields (Step 6)
  const [isCommercialDriver, setIsCommercialDriver] = useState(false);
  const [privateHireLicenseUrl, setPrivateHireLicenseUrl] = useState("");
  const [privateHireLicenseNumber, setPrivateHireLicenseNumber] = useState("");
  const [dvlaCheckCode, setDvlaCheckCode] = useState("");
  const [commercialInsuranceUrl, setCommercialInsuranceUrl] = useState("");
  const [commercialInsuranceExpiry, setCommercialInsuranceExpiry] = useState("");
  const [vehicleInspectionUrl, setVehicleInspectionUrl] = useState("");
  const [vehicleInspectionExpiry, setVehicleInspectionExpiry] = useState("");
  const [phvLicenseUrl, setPhvLicenseUrl] = useState("");
  const [phvLicenseNumber, setPhvLicenseNumber] = useState("");
  const [phvLicenseExpiry, setPhvLicenseExpiry] = useState("");
  const [ratePerMile, setRatePerMile] = useState("");
  const [driverTagline, setDriverTagline] = useState("");

  // Validation error states
  const [errors, setErrors] = useState<{
    licenseNumber?: string;
    insuranceExpiry?: string;
    sortCode?: string;
    accountNumber?: string;
  }>({});
  const [error, setError] = useState("");

  const progress = ((step - 2) / (totalSteps - 2)) * 100; // Steps 3-6 = 4 steps total

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api/user/upload-photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setProfileImageUrl(data.url);
      toast({
        title: "Photo Uploaded",
        description: "Your profile photo has been uploaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("license", file);

    try {
      const response = await fetch("/api/user/upload-license", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setDriverLicenseUrl(data.url);
      toast({
        title: "License Uploaded",
        description: "Your driver's license has been uploaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload license. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCommercialDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCommercial(field);
    const formData = new FormData();
    formData.append("license", file);

    try {
      const response = await fetch("/api/user/upload-license", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      
      switch (field) {
        case "privateHireLicenseUrl":
          setPrivateHireLicenseUrl(data.url);
          break;
        case "commercialInsuranceUrl":
          setCommercialInsuranceUrl(data.url);
          break;
        case "vehicleInspectionUrl":
          setVehicleInspectionUrl(data.url);
          break;
        case "phvLicenseUrl":
          setPhvLicenseUrl(data.url);
          break;
      }
      
      toast({
        title: "Document Uploaded",
        description: "Your document has been uploaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingCommercial(null);
    }
  };

  const upgradeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/user/upgrade-to-driver", data);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Success!",
        description: "You are now registered as a driver. You can start offering rides!",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/driver";
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upgrade account",
        variant: "destructive",
      });
    },
  });

  // Mutation for upgrading existing private driver to commercial/pro status
  const commercialUpgradeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/user/upgrade-to-commercial", data);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Congratulations!",
        description: "You are now a Pro driver with unlimited rides and earnings!",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/driver";
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upgrade to Pro status",
        variant: "destructive",
      });
    },
  });

  const validateStep = (): boolean => {
    setError("");
    const newErrors: typeof errors = {};

    switch (step) {
      case 3: // Profile Photo
        if (!profileImageUrl) {
          setError("Profile photo is required for drivers");
          return false;
        }
        return true;

      case 4: // License + Vehicle Info
        if (!driverLicenseUrl) {
          setError("Please upload your driver's license");
          return false;
        }
        if (!driverLicenseNumber || !driverLicenseExpiry) {
          setError("Please enter your license number and expiry date");
          return false;
        }
        const licenseValidation = validateUkDrivingLicense(driverLicenseNumber);
        if (!licenseValidation.valid) {
          newErrors.licenseNumber = licenseValidation.error;
          setErrors(newErrors);
          setError("Please fix the highlighted fields");
          return false;
        }
        if (!backgroundCheckConsent) {
          setError("You must consent to a background check");
          return false;
        }
        if (!vehicleMake || !vehicleModel || !vehicleRegistration) {
          setError("Please complete all vehicle information");
          return false;
        }
        return true;

      case 5: // Insurance + Bank Details
        if (!vehicleInsuranceExpiry) {
          newErrors.insuranceExpiry = "Insurance expiry date is required";
        } else {
          const insuranceValidation = validateInsuranceExpiry(vehicleInsuranceExpiry);
          if (!insuranceValidation.valid) {
            newErrors.insuranceExpiry = insuranceValidation.error;
          }
        }
        if (!bankAccountName) {
          setError("Please enter the account holder name");
          return false;
        }
        const sortCodeValidation = validateUkSortCode(bankSortCode);
        if (!sortCodeValidation.valid) {
          newErrors.sortCode = sortCodeValidation.error;
        }
        const accountValidation = validateUkAccountNumber(bankAccountNumber);
        if (!accountValidation.valid) {
          newErrors.accountNumber = accountValidation.error;
        }
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          setError("Please fix the highlighted fields");
          return false;
        }
        return true;

      case 6: // Commercial Driver (optional)
        return true;

      default:
        return true;
    }
  };

  const validateAllRequiredData = (): boolean => {
    setError("");
    const newErrors: typeof errors = {};

    // Validate profile photo
    if (!profileImageUrl) {
      setError("Profile photo is required. Please go back and add one.");
      setStep(3);
      return false;
    }

    // Validate license + vehicle (Step 4 data)
    if (!driverLicenseUrl) {
      setError("Please upload your driver's license");
      setStep(4);
      return false;
    }
    if (!driverLicenseNumber || !driverLicenseExpiry) {
      setError("Please enter your license number and expiry date");
      setStep(4);
      return false;
    }
    const licenseValidation = validateUkDrivingLicense(driverLicenseNumber);
    if (!licenseValidation.valid) {
      newErrors.licenseNumber = licenseValidation.error;
      setErrors(newErrors);
      setError("Please fix the license number");
      setStep(4);
      return false;
    }
    if (!backgroundCheckConsent) {
      setError("You must consent to a background check");
      setStep(4);
      return false;
    }
    if (!vehicleMake || !vehicleModel || !vehicleRegistration) {
      setError("Please complete all vehicle information");
      setStep(4);
      return false;
    }

    // Validate insurance + bank details (Step 5 data)
    if (!vehicleInsuranceExpiry) {
      newErrors.insuranceExpiry = "Insurance expiry date is required";
    } else {
      const insuranceValidation = validateInsuranceExpiry(vehicleInsuranceExpiry);
      if (!insuranceValidation.valid) {
        newErrors.insuranceExpiry = insuranceValidation.error;
      }
    }
    if (!bankAccountName) {
      setError("Please enter the account holder name");
      setStep(5);
      return false;
    }
    const sortCodeValidation = validateUkSortCode(bankSortCode);
    if (!sortCodeValidation.valid) {
      newErrors.sortCode = sortCodeValidation.error;
    }
    const accountValidation = validateUkAccountNumber(bankAccountNumber);
    if (!accountValidation.valid) {
      newErrors.accountNumber = accountValidation.error;
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setError("Please fix the highlighted fields");
      setStep(5);
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step === 6) {
        // Pro upgrade mode - use commercial upgrade endpoint
        if (isProUpgrade && isPrivateDriver) {
          commercialUpgradeMutation.mutate({
            privateHireLicenseUrl: isCommercialDriver ? privateHireLicenseUrl : undefined,
            privateHireLicenseNumber: isCommercialDriver ? privateHireLicenseNumber : undefined,
            dvlaCheckCode: isCommercialDriver ? dvlaCheckCode : undefined,
            commercialInsuranceUrl: isCommercialDriver ? commercialInsuranceUrl : undefined,
            commercialInsuranceExpiry: isCommercialDriver ? commercialInsuranceExpiry : undefined,
            vehicleInspectionUrl: isCommercialDriver ? vehicleInspectionUrl : undefined,
            vehicleInspectionExpiry: isCommercialDriver ? vehicleInspectionExpiry : undefined,
            phvLicenseUrl: isCommercialDriver ? phvLicenseUrl : undefined,
            phvLicenseNumber: isCommercialDriver ? phvLicenseNumber : undefined,
            phvLicenseExpiry: isCommercialDriver ? phvLicenseExpiry : undefined,
            ratePerMile,
            driverTagline,
          });
        } else {
          // Validate ALL required data before final submission
          if (!validateAllRequiredData()) {
            return;
          }
          // Submit the form for new driver registration
          upgradeMutation.mutate({
            profileImageUrl,
            driverLicenseUrl,
            driverLicenseNumber: driverLicenseNumber.toUpperCase().replace(/\s/g, ''),
            driverLicenseExpiry,
            backgroundCheckConsent,
            vehicleMake,
            vehicleModel,
            vehicleYear,
            vehicleColor,
            vehicleRegistration,
            vehicleInsuranceExpiry,
            bankAccountName,
            bankSortCode: bankSortCode.replace(/\D/g, ''),
            bankAccountNumber: bankAccountNumber.replace(/\D/g, ''),
            isCommercialDriver,
            privateHireLicenseUrl: isCommercialDriver ? privateHireLicenseUrl : undefined,
            privateHireLicenseNumber: isCommercialDriver ? privateHireLicenseNumber : undefined,
            dvlaCheckCode: isCommercialDriver ? dvlaCheckCode : undefined,
            commercialInsuranceUrl: isCommercialDriver ? commercialInsuranceUrl : undefined,
            commercialInsuranceExpiry: isCommercialDriver ? commercialInsuranceExpiry : undefined,
            vehicleInspectionUrl: isCommercialDriver ? vehicleInspectionUrl : undefined,
            vehicleInspectionExpiry: isCommercialDriver ? vehicleInspectionExpiry : undefined,
            phvLicenseUrl: isCommercialDriver ? phvLicenseUrl : undefined,
            phvLicenseNumber: isCommercialDriver ? phvLicenseNumber : undefined,
            phvLicenseExpiry: isCommercialDriver ? phvLicenseExpiry : undefined,
          });
        }
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    const minStep = isProUpgrade && isPrivateDriver ? 6 : (hasProfilePicture ? 4 : 3);
    if (step > minStep) {
      setStep(step - 1);
      setError("");
    } else if (isProUpgrade && isPrivateDriver) {
      navigate("/driver");
    }
  };

  const getStepTitle = () => {
    // Special title for pro upgrade mode
    if (isProUpgrade && isPrivateDriver) {
      return { title: "Upgrade to Pro", description: "Remove ride and earnings limits with commercial verification" };
    }
    switch (step) {
      case 3:
        return { title: "Profile Photo", description: "Add a photo so riders can recognize you" };
      case 4:
        return { title: "Driver Verification", description: "License and vehicle information" };
      case 5:
        return { title: "Insurance & Payment", description: "Insurance and bank details for payouts" };
      case 6:
        return { title: "Pro Account (Optional)", description: "Remove ride limits with commercial verification" };
      default:
        return { title: "Driver Registration", description: "" };
    }
  };

  const renderStep = () => {
    switch (step) {
      case 3: // Profile Photo
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Add Your Profile Photo</h2>
              <p className="text-muted-foreground">Riders want to see who they're riding with</p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <Avatar className="h-32 w-32 border-4 border-primary/20">
                  <AvatarImage src={profileImageUrl} />
                  <AvatarFallback className="text-3xl bg-primary/10">
                    {(user as any)?.firstName?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                {profileImageUrl && (
                  <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-1">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>

              <div className="w-full max-w-xs">
                <Label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg hover:border-primary/50 transition-colors">
                    {isUploadingPhoto ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <Camera className="h-8 w-8 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {profileImageUrl ? "Change Photo" : "Upload Photo"}
                    </span>
                  </div>
                </Label>
                <Input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={isUploadingPhoto}
                  className="hidden"
                  data-testid="input-profile-photo"
                />
              </div>
            </div>
          </div>
        );

      case 4: // License + Vehicle Info
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Driver's License
              </h3>
              
              <div className="space-y-2">
                <Label>Upload License Photo</Label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleLicenseUpload}
                    disabled={isUploading}
                    className="flex-1"
                    data-testid="input-license-upload"
                  />
                  {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
                  {driverLicenseUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    value={driverLicenseNumber}
                    onChange={(e) => {
                      setDriverLicenseNumber(e.target.value);
                      if (errors.licenseNumber) setErrors(prev => ({ ...prev, licenseNumber: undefined }));
                    }}
                    placeholder="e.g. SMITH701019AB9CD"
                    className={errors.licenseNumber ? "border-red-500" : ""}
                    data-testid="input-license-number"
                  />
                  {errors.licenseNumber && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.licenseNumber}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseExpiry">Expiry Date</Label>
                  <Input
                    id="licenseExpiry"
                    type="date"
                    value={driverLicenseExpiry}
                    onChange={(e) => setDriverLicenseExpiry(e.target.value)}
                    data-testid="input-license-expiry"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="backgroundCheck"
                  checked={backgroundCheckConsent}
                  onCheckedChange={(checked) => setBackgroundCheckConsent(checked as boolean)}
                  data-testid="checkbox-background"
                />
                <Label htmlFor="backgroundCheck" className="text-sm">
                  I consent to a background check being performed
                </Label>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Car className="h-5 w-5 text-secondary" />
                Vehicle Information
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleMake">Make *</Label>
                  <Input
                    id="vehicleMake"
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    placeholder="e.g. Toyota"
                    data-testid="input-vehicle-make"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleModel">Model *</Label>
                  <Input
                    id="vehicleModel"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="e.g. Prius"
                    data-testid="input-vehicle-model"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleYear">Year</Label>
                  <Input
                    id="vehicleYear"
                    value={vehicleYear}
                    onChange={(e) => setVehicleYear(e.target.value)}
                    placeholder="e.g. 2020"
                    data-testid="input-vehicle-year"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleColor">Color</Label>
                  <Input
                    id="vehicleColor"
                    value={vehicleColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                    placeholder="e.g. Silver"
                    data-testid="input-vehicle-color"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleReg">Registration Number *</Label>
                <Input
                  id="vehicleReg"
                  value={vehicleRegistration}
                  onChange={(e) => setVehicleRegistration(e.target.value)}
                  placeholder="e.g. AB12 CDE"
                  data-testid="input-vehicle-reg"
                />
              </div>
            </div>
          </div>
        );

      case 5: // Insurance + Bank Details
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Vehicle Insurance
              </h3>
              
              <div className="space-y-2">
                <Label htmlFor="insuranceExpiry">Insurance Expiry Date *</Label>
                <Input
                  id="insuranceExpiry"
                  type="date"
                  value={vehicleInsuranceExpiry}
                  onChange={(e) => {
                    setVehicleInsuranceExpiry(e.target.value);
                    if (errors.insuranceExpiry) setErrors(prev => ({ ...prev, insuranceExpiry: undefined }));
                  }}
                  className={errors.insuranceExpiry ? "border-red-500" : ""}
                  data-testid="input-insurance-expiry"
                />
                {errors.insuranceExpiry && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.insuranceExpiry}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must be valid for at least 30 days
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <PoundSterling className="h-5 w-5 text-accent" />
                Bank Details
              </h3>
              <p className="text-sm text-muted-foreground">
                Your earnings will be paid directly to this account
              </p>

              <div className="space-y-2">
                <Label htmlFor="bankName">Account Holder Name *</Label>
                <Input
                  id="bankName"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="Name on bank account"
                  data-testid="input-bank-name"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sortCode">Sort Code *</Label>
                  <Input
                    id="sortCode"
                    value={bankSortCode}
                    onChange={(e) => {
                      setBankSortCode(e.target.value);
                      if (errors.sortCode) setErrors(prev => ({ ...prev, sortCode: undefined }));
                    }}
                    placeholder="12-34-56"
                    className={errors.sortCode ? "border-red-500" : ""}
                    data-testid="input-sort-code"
                  />
                  {errors.sortCode && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.sortCode}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number *</Label>
                  <Input
                    id="accountNumber"
                    value={bankAccountNumber}
                    onChange={(e) => {
                      setBankAccountNumber(e.target.value);
                      if (errors.accountNumber) setErrors(prev => ({ ...prev, accountNumber: undefined }));
                    }}
                    placeholder="12345678"
                    className={errors.accountNumber ? "border-red-500" : ""}
                    data-testid="input-account-number"
                  />
                  {errors.accountNumber && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.accountNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 6: // Commercial Driver (Optional)
        return (
          <div className="space-y-6">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">Private Driver Limits</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Without commercial verification, you're limited to 5 rides per day and £99.99 GBP in daily earnings.
                    Complete this section to remove these limits.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 mb-4">
              <Checkbox
                id="isCommercialDriver"
                checked={isCommercialDriver}
                onCheckedChange={(checked) => setIsCommercialDriver(checked as boolean)}
                data-testid="checkbox-commercial"
              />
              <Label htmlFor="isCommercialDriver" className="font-medium">
                I want to register as a Commercial (Pro) Driver
              </Label>
            </div>

            {isCommercialDriver && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Private Hire License */}
                <div className="space-y-4">
                  <h4 className="font-medium">Private Hire License</h4>
                  <div className="space-y-2">
                    <Label>Upload License Document</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleCommercialDocUpload(e, "privateHireLicenseUrl")}
                        disabled={isUploadingCommercial === "privateHireLicenseUrl"}
                        className="flex-1"
                        data-testid="input-private-hire-license"
                      />
                      {isUploadingCommercial === "privateHireLicenseUrl" && <Loader2 className="h-5 w-5 animate-spin" />}
                      {privateHireLicenseUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="privateHireLicenseNumber">License Number</Label>
                    <Input
                      id="privateHireLicenseNumber"
                      value={privateHireLicenseNumber}
                      onChange={(e) => setPrivateHireLicenseNumber(e.target.value)}
                      placeholder="Enter license number"
                      data-testid="input-private-hire-number"
                    />
                  </div>
                </div>

                {/* DVLA Check Code */}
                <div className="space-y-2">
                  <Label htmlFor="dvlaCheckCode">DVLA Check Code</Label>
                  <Input
                    id="dvlaCheckCode"
                    value={dvlaCheckCode}
                    onChange={(e) => setDvlaCheckCode(e.target.value)}
                    placeholder="Enter your DVLA check code"
                    data-testid="input-dvla-code"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from the DVLA View Driving Licence service
                  </p>
                </div>

                {/* Commercial Insurance */}
                <div className="space-y-4">
                  <h4 className="font-medium">Commercial Insurance</h4>
                  <div className="space-y-2">
                    <Label>Upload Insurance Document</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleCommercialDocUpload(e, "commercialInsuranceUrl")}
                        disabled={isUploadingCommercial === "commercialInsuranceUrl"}
                        className="flex-1"
                        data-testid="input-commercial-insurance"
                      />
                      {isUploadingCommercial === "commercialInsuranceUrl" && <Loader2 className="h-5 w-5 animate-spin" />}
                      {commercialInsuranceUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commercialInsuranceExpiry">Expiry Date</Label>
                    <Input
                      id="commercialInsuranceExpiry"
                      type="date"
                      value={commercialInsuranceExpiry}
                      onChange={(e) => setCommercialInsuranceExpiry(e.target.value)}
                      data-testid="input-commercial-insurance-expiry"
                    />
                  </div>
                </div>

                {/* Vehicle Inspection */}
                <div className="space-y-4">
                  <h4 className="font-medium">Vehicle Inspection Certificate</h4>
                  <div className="space-y-2">
                    <Label>Upload Inspection Document</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleCommercialDocUpload(e, "vehicleInspectionUrl")}
                        disabled={isUploadingCommercial === "vehicleInspectionUrl"}
                        className="flex-1"
                        data-testid="input-vehicle-inspection"
                      />
                      {isUploadingCommercial === "vehicleInspectionUrl" && <Loader2 className="h-5 w-5 animate-spin" />}
                      {vehicleInspectionUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleInspectionExpiry">Expiry Date</Label>
                    <Input
                      id="vehicleInspectionExpiry"
                      type="date"
                      value={vehicleInspectionExpiry}
                      onChange={(e) => setVehicleInspectionExpiry(e.target.value)}
                      data-testid="input-vehicle-inspection-expiry"
                    />
                  </div>
                </div>

                {/* PHV License */}
                <div className="space-y-4">
                  <h4 className="font-medium">PHV (Private Hire Vehicle) License</h4>
                  <div className="space-y-2">
                    <Label>Upload PHV License</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleCommercialDocUpload(e, "phvLicenseUrl")}
                        disabled={isUploadingCommercial === "phvLicenseUrl"}
                        className="flex-1"
                        data-testid="input-phv-license"
                      />
                      {isUploadingCommercial === "phvLicenseUrl" && <Loader2 className="h-5 w-5 animate-spin" />}
                      {phvLicenseUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phvLicenseNumber">License Number</Label>
                      <Input
                        id="phvLicenseNumber"
                        value={phvLicenseNumber}
                        onChange={(e) => setPhvLicenseNumber(e.target.value)}
                        placeholder="Enter PHV license number"
                        data-testid="input-phv-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phvLicenseExpiry">Expiry Date</Label>
                      <Input
                        id="phvLicenseExpiry"
                        type="date"
                        value={phvLicenseExpiry}
                        onChange={(e) => setPhvLicenseExpiry(e.target.value)}
                        data-testid="input-phv-expiry"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isCommercialDriver && (
              <p className="text-sm text-muted-foreground text-center py-4">
                You can skip this step and register as a private driver. You can upgrade later.
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const stepInfo = getStepTitle();

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Become a Driver</h1>
          <p className="text-muted-foreground">
            Complete your driver registration to start earning
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Step {step - 2} of {totalSteps - 2}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Benefits Cards - only show on first step (not for pro upgrade) */}
        {!isProUpgrade && step === getStartingStep() && (
          <div className="grid gap-4 mb-8">
            <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg">
              <Car className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold">Set Your Own Schedule</h3>
                <p className="text-sm text-muted-foreground">Drive when you want, choose your routes</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-secondary/5 rounded-lg">
              <PoundSterling className="h-8 w-8 text-secondary" />
              <div>
                <h3 className="font-semibold">Fair Earnings</h3>
                <p className="text-sm text-muted-foreground">Keep more of what you earn with our low fees</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-accent/5 rounded-lg">
              <Shield className="h-8 w-8 text-accent" />
              <div>
                <h3 className="font-semibold">Verified Community</h3>
                <p className="text-sm text-muted-foreground">All drivers are background checked</p>
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === 6 && <Briefcase className="h-5 w-5" />}
              {stepInfo.title}
            </CardTitle>
            <CardDescription>{stepInfo.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {renderStep()}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isProUpgrade && isPrivateDriver ? false : step === getStartingStep()}
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              <Button
                type="button"
                onClick={handleNext}
                disabled={upgradeMutation.isPending || commercialUpgradeMutation.isPending}
                data-testid="button-next"
              >
                {(upgradeMutation.isPending || commercialUpgradeMutation.isPending) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : step === 6 ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {isProUpgrade && isPrivateDriver ? "Upgrade to Pro" : "Complete Registration"}
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
