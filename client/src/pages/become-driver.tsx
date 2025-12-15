import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Car, Shield, PoundSterling, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function BecomeDriverPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if ((user as any)?.isDriver) {
      navigate("/driver");
    }
  }, [user, navigate]);

  const [driverLicenseUrl, setDriverLicenseUrl] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState("");
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [vehicleInsuranceExpiry, setVehicleInsuranceExpiry] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [isUploading, setIsUploading] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!driverLicenseUrl) {
      toast({
        title: "Missing Information",
        description: "Please upload your driver's license",
        variant: "destructive",
      });
      return;
    }

    if (!driverLicenseNumber || !driverLicenseExpiry) {
      toast({
        title: "Missing Information",
        description: "Please enter your license number and expiry date",
        variant: "destructive",
      });
      return;
    }

    if (!backgroundCheckConsent) {
      toast({
        title: "Consent Required",
        description: "You must consent to a background check to become a driver",
        variant: "destructive",
      });
      return;
    }

    if (!vehicleMake || !vehicleModel || !vehicleRegistration) {
      toast({
        title: "Missing Information",
        description: "Please enter your vehicle details",
        variant: "destructive",
      });
      return;
    }

    if (!bankAccountName || !bankSortCode || !bankAccountNumber) {
      toast({
        title: "Missing Information",
        description: "Please enter your bank details to receive payments",
        variant: "destructive",
      });
      return;
    }

    upgradeMutation.mutate({
      driverLicenseUrl,
      driverLicenseNumber,
      driverLicenseExpiry,
      backgroundCheckConsent,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleRegistration,
      vehicleInsuranceExpiry,
      bankAccountName,
      bankSortCode,
      bankAccountNumber,
    });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Become a Driver</h1>
          <p className="text-muted-foreground">
            Start earning by offering rides in your area. Complete the form below to get started.
          </p>
        </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Driver Registration</CardTitle>
            <CardDescription>
              Please provide the following information to complete your driver registration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Driver's License</h3>
                
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License Number</Label>
                    <Input
                      id="licenseNumber"
                      value={driverLicenseNumber}
                      onChange={(e) => setDriverLicenseNumber(e.target.value)}
                      placeholder="XXXXX-XXXXX-XXXXX"
                      data-testid="input-license-number"
                    />
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
                <h3 className="font-semibold text-lg">Vehicle Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleMake">Make</Label>
                    <Input
                      id="vehicleMake"
                      value={vehicleMake}
                      onChange={(e) => setVehicleMake(e.target.value)}
                      placeholder="e.g. Toyota"
                      data-testid="input-vehicle-make"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleModel">Model</Label>
                    <Input
                      id="vehicleModel"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="e.g. Prius"
                      data-testid="input-vehicle-model"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleReg">Registration Number</Label>
                    <Input
                      id="vehicleReg"
                      value={vehicleRegistration}
                      onChange={(e) => setVehicleRegistration(e.target.value)}
                      placeholder="e.g. AB12 CDE"
                      data-testid="input-vehicle-reg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceExpiry">Insurance Expiry</Label>
                    <Input
                      id="insuranceExpiry"
                      type="date"
                      value={vehicleInsuranceExpiry}
                      onChange={(e) => setVehicleInsuranceExpiry(e.target.value)}
                      data-testid="input-insurance-expiry"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Bank Details</h3>
                <p className="text-sm text-muted-foreground">
                  Your earnings will be paid directly to this account
                </p>

                <div className="space-y-2">
                  <Label htmlFor="bankName">Account Holder Name</Label>
                  <Input
                    id="bankName"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Name on bank account"
                    data-testid="input-bank-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sortCode">Sort Code</Label>
                    <Input
                      id="sortCode"
                      value={bankSortCode}
                      onChange={(e) => setBankSortCode(e.target.value)}
                      placeholder="00-00-00"
                      data-testid="input-sort-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="12345678"
                      data-testid="input-account-number"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg"
                disabled={upgradeMutation.isPending}
                data-testid="button-submit-driver"
              >
                {upgradeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Car className="mr-2 h-5 w-5" />
                    Complete Driver Registration
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
