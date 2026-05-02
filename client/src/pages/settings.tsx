import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Lock, Trash2, Camera, Loader2, AlertTriangle, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { COUNTRY_CODES, type CountryCode } from "@/lib/countryCodes";

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("profile");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Lock className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account">
              <Trash2 className="h-4 w-4 mr-2" />
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileSection user={user} />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySection />
          </TabsContent>

          <TabsContent value="account">
            <AccountSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ProfileSection({ user }: { user: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [countryCode, setCountryCode] = useState(() => {
    const phone = user?.phoneNumber || "";
    const match = COUNTRY_CODES.find((c: CountryCode) => phone.startsWith(c.code));
    return match?.code || "+44";
  });
  const [phoneNumber, setPhoneNumber] = useState(() => {
    const phone = user?.phoneNumber || "";
    const match = COUNTRY_CODES.find((c: CountryCode) => phone.startsWith(c.code));
    return match ? phone.slice(match.code.length) : phone;
  });
  const [homeAddress, setHomeAddress] = useState(user?.homeAddress || "");
  const [city, setCity] = useState(user?.city || "");
  const [postcode, setPostcode] = useState(user?.postcode || "");
  const [isUploading, setIsUploading] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", "/api/settings/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    const fullPhone = phoneNumber ? `${countryCode}${phoneNumber.replace(/\s/g, '')}` : undefined;
    updateProfileMutation.mutate({
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phoneNumber: fullPhone,
      homeAddress: homeAddress || undefined,
      city: city || undefined,
      postcode: postcode || undefined,
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("profileImage", file);

      const response = await fetch("/api/settings/profile-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Photo updated",
        description: "Your profile photo has been updated.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload profile photo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your personal details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user?.profileImageUrl} />
              <AvatarFallback className="text-2xl bg-accent text-white">
                {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="profile-image-upload"
              className="absolute bottom-0 right-0 p-2 bg-accent text-white rounded-full cursor-pointer hover:bg-accent/90 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </label>
            <input
              id="profile-image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={isUploading}
              data-testid="input-profile-image"
            />
          </div>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          {user?.passId && (
            <div
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-mono"
              data-testid="text-saviaj-pass"
              title="Your unique Saviaj member identifier"
            >
              <span className="text-muted-foreground">Saviaj Pass</span>
              <span className="font-semibold tracking-wide">{user.passId}</span>
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-label="First name"
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-label="Last name"
                data-testid="input-last-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <div className="flex gap-2">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="w-[140px]" data-testid="select-country-code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]" style={{ zIndex: 9999 }}>
                  {COUNTRY_CODES.map((country: CountryCode) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.flag} {country.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                aria-label="Phone number"
                className="flex-1"
                data-testid="input-phone"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Home address</Label>
            <Input
              id="address"
              value={homeAddress}
              onChange={(e) => setHomeAddress(e.target.value)}
              aria-label="Home address"
              data-testid="input-address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="City"
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                aria-label="Postcode"
                data-testid="input-postcode"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSaveProfile}
          disabled={updateProfileMutation.isPending}
          className="w-full bg-accent hover:bg-accent/90"
          data-testid="button-save-profile"
        >
          {updateProfileMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function SecuritySection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest("POST", "/api/settings/change-password", data);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Password change failed",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-label="Current password"
            data-testid="input-current-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-label="New password"
            data-testid="input-new-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-label="Confirm new password"
            data-testid="input-confirm-password"
          />
        </div>

        <Button
          onClick={handleChangePassword}
          disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
          className="w-full bg-accent hover:bg-accent/90"
          data-testid="button-change-password"
        >
          {changePasswordMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Changing...
            </>
          ) : (
            "Change Password"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function AccountSection() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const deleteAccountMutation = useMutation({
    mutationFn: async (data: { reason?: string; password?: string }) => {
      return apiRequest("DELETE", "/api/settings/account", data);
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account has been scheduled for deletion.",
      });
      navigate("/");
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate({
      reason: deleteReason || undefined,
      password: deletePassword || undefined,
    });
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Actions here are permanent and cannot be undone by you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full"
              data-testid="button-delete-account"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Delete Your Account
              </DialogTitle>
              <DialogDescription>
                This will permanently delete your account and all associated data.
                Your ride history, ratings, and profile will be removed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="deleteReason">Why are you leaving? (optional)</Label>
                <Textarea
                  id="deleteReason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  aria-label="Reason for deletion"
                  rows={3}
                  data-testid="input-delete-reason"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deletePassword">Confirm your password</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  aria-label="Password confirmation"
                  data-testid="input-delete-password"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteAccountMutation.isPending || !deletePassword}
                data-testid="button-confirm-delete"
              >
                {deleteAccountMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete My Account"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          If you need help recovering your account, contact support within 30 days.
        </p>
      </CardContent>
    </Card>
  );
}
