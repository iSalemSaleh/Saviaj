import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { User, Lock, Trash2, Camera, Loader2, AlertTriangle, ChevronLeft, ShieldCheck, Wallet, BadgeCheck, RefreshCw, CheckCircle2, XCircle, Clock, TrendingUp, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
          <TabsList className={user?.isDriver ? "grid w-full grid-cols-5" : "grid w-full grid-cols-3"}>
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Lock className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            {user?.isDriver && (
              <TabsTrigger value="compliance" data-testid="tab-compliance">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Compliance
              </TabsTrigger>
            )}
            {user?.isDriver && (
              <TabsTrigger value="payouts" data-testid="tab-payouts">
                <Wallet className="h-4 w-4 mr-2" />
                Payouts
              </TabsTrigger>
            )}
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

          {user?.isDriver && (
            <TabsContent value="compliance">
              <ComplianceSection />
            </TabsContent>
          )}

          {user?.isDriver && (
            <TabsContent value="payouts">
              <PayoutsSection />
              <div className="h-6" />
              <IdentityVerificationSection />
            </TabsContent>
          )}

          <TabsContent value="account">
            <AccountSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ============================================================
// Compliance dashboard — driver-only. Aggregates DBS, DVLA,
// Hire & Reward insurance, KYC, sanctions and tax-acknowledge
// state with traffic-light badges + days-until-expiry. Backed
// by `GET /api/driver/compliance` so the screen reflects the
// authoritative server state, not the cached `/api/auth/user`.
// ============================================================
function ComplianceSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/driver/compliance"],
  });

  // Mutations -------------------------------------------------------------
  const ackTax = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/acknowledge-tax-notice", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Tax notice acknowledged" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const startKyc = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/driver/kyc/start", { provider: "manual" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance"] });
      toast({ title: "KYC started", description: "Identity verification is now pending review." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const refreshDvla = useMutation({
    mutationFn: async (dvlaCheckCode: string) => {
      const res = await apiRequest("POST", "/api/driver/dvla/refresh", dvlaCheckCode ? { dvlaCheckCode } : {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance"] });
      toast({ title: "DVLA check requested", description: "Your check has been queued for review." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const uploadDbs = useMutation({
    mutationFn: async (form: FormData) => {
      const res = await fetch("/api/driver/dbs", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance"] });
      toast({ title: "DBS certificate submitted", description: "We'll review it shortly." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const uploadHr = useMutation({
    mutationFn: async (form: FormData) => {
      const res = await fetch("/api/driver/hire-reward-insurance", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance"] });
      toast({ title: "Hire & Reward insurance submitted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  // Local state for the upload dialogs ------------------------------------
  const [dbsOpen, setDbsOpen] = useState(false);
  const [dbsNum, setDbsNum] = useState("");
  const [dbsIssue, setDbsIssue] = useState("");
  const [dbsExpiryDate, setDbsExpiryDate] = useState("");
  const [dbsUpdate, setDbsUpdate] = useState(false);
  const [dbsFile, setDbsFile] = useState<File | null>(null);

  const [hrOpen, setHrOpen] = useState(false);
  const [hrExpiryDate, setHrExpiryDate] = useState("");
  const [hrFile, setHrFile] = useState<File | null>(null);

  const [dvlaOpen, setDvlaOpen] = useState(false);
  const [dvlaCode, setDvlaCode] = useState("");

  const submitDbs = () => {
    if (!dbsFile || !dbsNum || !dbsIssue || !dbsExpiryDate) {
      toast({ title: "Missing fields", description: "Certificate file, number, issue and expiry are required.", variant: "destructive" });
      return;
    }
    const fd = new FormData();
    fd.append("dbsCertificate", dbsFile);
    fd.append("dbsCertificateNumber", dbsNum);
    fd.append("dbsCertificateIssueDate", dbsIssue);
    fd.append("dbsCertificateExpiry", dbsExpiryDate);
    fd.append("dbsUpdateServiceSubscribed", String(dbsUpdate));
    uploadDbs.mutate(fd, { onSuccess: () => { setDbsOpen(false); setDbsFile(null); setDbsNum(""); setDbsIssue(""); setDbsExpiryDate(""); setDbsUpdate(false); } });
  };

  const submitHr = () => {
    if (!hrFile || !hrExpiryDate) {
      toast({ title: "Missing fields", description: "Insurance file and expiry date are required.", variant: "destructive" });
      return;
    }
    const fd = new FormData();
    fd.append("insuranceCertificate", hrFile);
    fd.append("hireRewardInsuranceExpiry", hrExpiryDate);
    uploadHr.mutate(fd, { onSuccess: () => { setHrOpen(false); setHrFile(null); setHrExpiryDate(""); } });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  // Status -> badge variant. Greens are "all good", amber means
  // pending / submitted, reds are blocking issues.
  const statusBadge = (label: string, kind: "ok" | "pending" | "warn" | "fail" | "neutral") => {
    const cls =
      kind === "ok"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
        : kind === "pending"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : kind === "warn"
        ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"
        : kind === "fail"
        ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
        : "bg-muted text-muted-foreground border-border";
    return (
      <Badge variant="outline" className={cls} data-testid={`badge-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {label}
      </Badge>
    );
  };

  const expiryHelper = (days: number | null | undefined): { kind: "ok" | "warn" | "fail" | "neutral"; label: string } => {
    if (days === null || days === undefined) return { kind: "neutral", label: "No date" };
    if (days < 0) return { kind: "fail", label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
    if (days <= 30) return { kind: "warn", label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
    return { kind: "ok", label: `Valid · ${days} day${days === 1 ? "" : "s"} remaining` };
  };

  const Row = ({
    title,
    description,
    badge,
    detail,
  }: {
    title: string;
    description: string;
    badge: React.ReactNode;
    detail?: React.ReactNode;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        {detail && <div className="text-xs text-muted-foreground mt-1">{detail}</div>}
      </div>
      <div className="shrink-0">{badge}</div>
    </div>
  );

  // ---- Each compliance row -------------------------------------------------
  const dbsExpiry = expiryHelper(data.dbs?.daysUntilExpiry);
  const hrExpiry = expiryHelper(data.hireRewardInsurance?.daysUntilExpiry);

  // DBS overall status: prefer expiry status when we have a date, otherwise
  // fall back to the textual backgroundCheckStatus from the server.
  const dbsBadge = data.dbs?.expiry
    ? statusBadge(dbsExpiry.label, dbsExpiry.kind)
    : data.dbs?.status === "approved"
    ? statusBadge("Approved", "ok")
    : data.dbs?.status === "submitted"
    ? statusBadge("Under review", "pending")
    : data.dbs?.status === "rejected"
    ? statusBadge("Rejected", "fail")
    : statusBadge("Not submitted", "warn");

  const dvlaBadge =
    data.dvla?.status === "verified"
      ? statusBadge("Verified", "ok")
      : data.dvla?.status === "failed"
      ? statusBadge("Failed", "fail")
      : data.dvla?.status === "expired"
      ? statusBadge("Expired", "fail")
      : statusBadge("Pending", "pending");

  const hrBadge = !data.hireRewardInsurance?.uploaded
    ? statusBadge("Not uploaded", "warn")
    : data.hireRewardInsurance?.daysUntilExpiry !== null
    ? statusBadge(hrExpiry.label, hrExpiry.kind)
    : statusBadge("Pending review", "pending");

  const kycBadge =
    data.kyc?.status === "verified"
      ? statusBadge("Verified", "ok")
      : data.kyc?.status === "submitted"
      ? statusBadge("Under review", "pending")
      : data.kyc?.status === "failed"
      ? statusBadge("Failed", "fail")
      : statusBadge("Not started", "warn");

  const sanctionsBadge =
    data.sanctions?.status === "cleared"
      ? statusBadge("Cleared", "ok")
      : data.sanctions?.status === "flagged"
      ? statusBadge("Flagged", "fail")
      : statusBadge("Pending", "pending");

  const taxBadge = data.taxSelfEmploymentAcknowledged
    ? statusBadge("Acknowledged", "ok")
    : statusBadge("Required", "fail");

  return (
    <Card data-testid="card-compliance">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Driver Compliance
        </CardTitle>
        <CardDescription>
          Statutory checks and documents you need to keep current to drive
          on Saviaj. Items that have expired or are missing must be
          resolved before you can accept paying passengers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Row
          title="Self-employment / Tax notice"
          description="You are responsible for declaring your earnings and paying your own tax and National Insurance."
          badge={taxBadge}
          detail={data.taxAcknowledgedAt ? `Accepted on ${new Date(data.taxAcknowledgedAt).toLocaleDateString()}` : undefined}
        />
        <Row
          title="Enhanced DBS check"
          description="Background check from the Disclosure & Barring Service. Required for all drivers carrying members of the public."
          badge={dbsBadge}
          detail={
            data.dbs?.certificateNumber
              ? `Certificate ${data.dbs.certificateNumber}${data.dbs.updateServiceSubscribed ? " · DBS Update Service: yes" : ""}`
              : undefined
          }
        />
        <Row
          title="DVLA driving licence check"
          description="Validates your driving entitlement against the DVLA via your share-driving-licence code."
          badge={dvlaBadge}
          detail={
            data.dvla?.lastCheckedAt
              ? `Last checked ${new Date(data.dvla.lastCheckedAt).toLocaleDateString()}${data.dvla.checkCode ? ` · Code ${data.dvla.checkCode}` : ""}`
              : undefined
          }
        />
        <Row
          title="Hire & Reward insurance"
          description="Standard motor insurance does NOT cover paying passengers. You must hold a valid H&R policy."
          badge={hrBadge}
          detail={data.hireRewardInsurance?.expiry ? `Expires ${new Date(data.hireRewardInsurance.expiry).toLocaleDateString()}` : undefined}
        />
        <Row
          title="Identity verification (KYC)"
          description="Confirms your identity using a photo ID and a live selfie via our KYC partner."
          badge={kycBadge}
          detail={data.kyc?.provider ? `Provider: ${data.kyc.provider}` : undefined}
        />
        <Row
          title="Sanctions / AML screening"
          description="UK / EU / OFAC sanctions and PEP screening. Re-run periodically while your driver account is active."
          badge={sanctionsBadge}
          detail={data.sanctions?.screenedAt ? `Last screened ${new Date(data.sanctions.screenedAt).toLocaleDateString()}` : undefined}
        />

        {data.commercial && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium mb-2">Commercial driver records</div>
            <Row
              title="Local Licensing Authority"
              description="Council that issues your private hire / hackney plate."
              badge={statusBadge(data.commercial.licensingCouncil || "Not set", data.commercial.licensingCouncil ? "ok" : "fail")}
            />
            <Row
              title="PHV operator licence"
              description="Your private hire vehicle operator licence."
              badge={
                data.commercial.phvLicenseExpiry
                  ? (() => {
                      const d = expiryHelper(Math.floor((new Date(data.commercial.phvLicenseExpiry).getTime() - Date.now()) / 86400000));
                      return statusBadge(d.label, d.kind);
                    })()
                  : statusBadge("Not on file", "warn")
              }
            />
            <Row
              title="Vehicle inspection"
              description="MOT-style inspection certificate required for taxi / PHV operation."
              badge={
                data.commercial.vehicleInspectionExpiry
                  ? (() => {
                      const d = expiryHelper(Math.floor((new Date(data.commercial.vehicleInspectionExpiry).getTime() - Date.now()) / 86400000));
                      return statusBadge(d.label, d.kind);
                    })()
                  : statusBadge("Not on file", "warn")
              }
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          {!data.taxSelfEmploymentAcknowledged && (
            <Button variant="default" size="sm" onClick={() => ackTax.mutate()} disabled={ackTax.isPending} data-testid="button-acknowledge-tax">
              {ackTax.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Acknowledge tax notice"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDbsOpen(true)} data-testid="button-open-dbs">
            Upload DBS
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHrOpen(true)} data-testid="button-open-hr">
            Upload H&amp;R insurance
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDvlaOpen(true)} data-testid="button-open-dvla">
            Refresh DVLA check
          </Button>
          {data.kyc?.status !== "verified" && data.kyc?.status !== "submitted" && (
            <Button variant="outline" size="sm" onClick={() => startKyc.mutate()} disabled={startKyc.isPending} data-testid="button-start-kyc">
              {startKyc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start KYC"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-compliance">
            Refresh
          </Button>
        </div>

        {/* DBS upload dialog */}
        <Dialog open={dbsOpen} onOpenChange={setDbsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload DBS Certificate</DialogTitle>
              <DialogDescription>
                Submit your Enhanced DBS certificate. We'll review it before
                marking your background check as approved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Certificate file (PDF / JPG / PNG)</Label>
                <Input type="file" accept=".pdf,image/png,image/jpeg" onChange={(e) => setDbsFile(e.target.files?.[0] || null)} data-testid="input-dbs-file" />
              </div>
              <div>
                <Label>Certificate number</Label>
                <Input value={dbsNum} onChange={(e) => setDbsNum(e.target.value)} placeholder="e.g. 001234567890" data-testid="input-dbs-number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Issue date</Label>
                  <Input type="date" value={dbsIssue} onChange={(e) => setDbsIssue(e.target.value)} data-testid="input-dbs-issue" />
                </div>
                <div>
                  <Label>Expiry date</Label>
                  <Input type="date" value={dbsExpiryDate} onChange={(e) => setDbsExpiryDate(e.target.value)} data-testid="input-dbs-expiry" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={dbsUpdate} onChange={(e) => setDbsUpdate(e.target.checked)} data-testid="checkbox-dbs-update" />
                I'm subscribed to the DBS Update Service
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDbsOpen(false)}>Cancel</Button>
              <Button onClick={submitDbs} disabled={uploadDbs.isPending} data-testid="button-submit-dbs">
                {uploadDbs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* H&R insurance upload dialog */}
        <Dialog open={hrOpen} onOpenChange={setHrOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Hire &amp; Reward Insurance</DialogTitle>
              <DialogDescription>
                Standard motor insurance does NOT cover paying passengers.
                Upload your current Hire &amp; Reward certificate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Certificate file (PDF / JPG / PNG)</Label>
                <Input type="file" accept=".pdf,image/png,image/jpeg" onChange={(e) => setHrFile(e.target.files?.[0] || null)} data-testid="input-hr-file" />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input type="date" value={hrExpiryDate} onChange={(e) => setHrExpiryDate(e.target.value)} data-testid="input-hr-expiry" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHrOpen(false)}>Cancel</Button>
              <Button onClick={submitHr} disabled={uploadHr.isPending} data-testid="button-submit-hr">
                {uploadHr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DVLA refresh dialog */}
        <Dialog open={dvlaOpen} onOpenChange={setDvlaOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refresh DVLA Driving Licence Check</DialogTitle>
              <DialogDescription>
                Generate a fresh share code at gov.uk/view-driving-licence
                and paste it below. Your check will be marked pending until
                we've verified it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>DVLA share code (optional)</Label>
                <Input value={dvlaCode} onChange={(e) => setDvlaCode(e.target.value)} placeholder="e.g. AB12 CD34" data-testid="input-dvla-code" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDvlaOpen(false)}>Cancel</Button>
              <Button
                onClick={() => refreshDvla.mutate(dvlaCode, { onSuccess: () => { setDvlaOpen(false); setDvlaCode(""); } })}
                disabled={refreshDvla.isPending}
                data-testid="button-submit-dvla"
              >
                {refreshDvla.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
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

// ============================================================
// Payouts (Stripe Connect Express) — driver-only.
// Surfaces onboarding state from /api/driver/connect/status and
// either CTAs the driver to start onboarding or shows a green
// "Payouts active" badge once Stripe has approved the account.
// Drivers cannot earn (bid, go online, complete a paid ride
// payout) until this is in the green state — matches the
// server-side gate in canDriverEarn().
// ============================================================
function PayoutsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/driver/connect/status"],
    refetchInterval: 15_000,
  });

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/driver/connect/onboard", {});
      return res.json();
    },
    onSuccess: (resp: any) => {
      if (resp?.url) {
        window.location.href = resp.url;
      } else {
        toast({ title: "Couldn't start onboarding", description: "No link returned by Stripe", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Onboarding failed", description: err?.message || "Try again later", variant: "destructive" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/driver/connect/refresh", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/connect/status"] });
      toast({ title: "Status refreshed" });
    },
    onError: (err: any) => {
      toast({ title: "Refresh failed", description: err?.message || "Try again later", variant: "destructive" });
    },
  });

  const onboarded = !!data?.onboarded;
  const payoutsEnabled = !!data?.payoutsEnabled;
  const requirementsDue: string[] = Array.isArray(data?.requirementsDue) ? data.requirementsDue : [];

  return (
    <Card data-testid="card-payouts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Driver Payouts
        </CardTitle>
        <CardDescription>
          We pay your earnings (ride price minus the platform fee) into the bank account
          you set up here. Stripe Express handles ID + bank details on their side — we
          never see them. Until this is active, you can't bid, go online, or get paid.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : payoutsEnabled && onboarded ? (
          <>
            <Badge className="bg-green-600 hover:bg-green-700" data-testid="badge-payouts-active">
              <BadgeCheck className="h-3 w-3 mr-1" />
              Payouts active
            </Badge>
            <p className="text-sm text-muted-foreground">
              You're all set. Earnings transfer to your bank automatically after each
              completed ride, on Stripe's standard payout schedule.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-refresh-payout-status"
            >
              {refreshMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh status
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm" data-testid="alert-payouts-incomplete">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-900">
                  {data?.hasAccount ? "Onboarding not finished yet" : "Set up payouts to start earning"}
                </p>
                {requirementsDue.length > 0 && (
                  <p className="text-amber-800 mt-1">
                    Stripe still needs: {requirementsDue.join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onboardMutation.mutate()}
                disabled={onboardMutation.isPending}
                data-testid="button-start-onboarding"
              >
                {onboardMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {data?.hasAccount ? "Continue onboarding" : "Set up payouts with Stripe"}
              </Button>
              {data?.hasAccount && (
                <Button
                  variant="outline"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  data-testid="button-refresh-payout-status"
                >
                  Refresh status
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
      <PayoutHistory />
    </Card>
  );
}

// ============================================================
// Per-ride payout history. Lists every Stripe Transfer we tried
// to send for this driver, newest first. Failed rows surface the
// Stripe error and a Retry button that re-runs the transfer.
// ============================================================
type PayoutRow = {
  id: number;
  rideId: number;
  status: 'pending' | 'transferred' | 'failed' | 'reversed' | 'reversed_with_debt' | string;
  stripeTransferId: string | null;
  amountPence: number;
  failureReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  rideCompletedAt: string | null;
};

type PayoutSummary = {
  paidThisWeekPence: number;
  paidThisMonthPence: number;
  paidLifetimePence: number;
  pendingPence: number;
  failedStuckPence: number;
};

type PayoutTrendPoint = {
  periodStart: string;
  paidPence: number;
};

type PayoutTrend = {
  period: 'week' | 'month';
  points: PayoutTrendPoint[];
};

type PayoutsResponse = {
  payouts: PayoutRow[];
  summary: PayoutSummary;
  trend: PayoutTrend;
};

function SummaryCard({
  label,
  valuePence,
  testId,
  highlight,
  tone,
}: {
  label: string;
  valuePence: number;
  testId: string;
  highlight?: boolean;
  tone?: 'danger';
}) {
  const formatted = `£${(valuePence / 100).toFixed(2)}`;
  const valueClass =
    tone === 'danger'
      ? 'text-red-600'
      : highlight
        ? 'text-accent'
        : 'text-foreground';
  return (
    <div className="border rounded-md p-2.5" data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-base font-semibold tabular-nums ${valueClass}`} data-testid={`${testId}-value`}>
        {formatted}
      </p>
    </div>
  );
}

// ============================================================
// Earnings trend chart. Shows the driver's paid-out totals
// bucketed by week (last 12) or month (last 6) so they can see
// at a glance whether earnings are trending up or down. Reuses
// the same data source as the summary cards (transferred-only,
// time basis = COALESCE(updated_at, created_at)) so the
// rightmost bar always matches "Paid this week/month".
// ============================================================
function EarningsTrendChart({
  trend,
  period,
  onPeriodChange,
  isLoading,
}: {
  trend: PayoutTrend | undefined;
  period: 'week' | 'month';
  onPeriodChange: (p: 'week' | 'month') => void;
  isLoading: boolean;
}) {
  const points = trend?.points ?? [];
  const totalPence = points.reduce((sum, p) => sum + (p.paidPence || 0), 0);
  const hasAnyEarnings = totalPence > 0;

  const formatBucketLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    if (period === 'month') {
      return d.toLocaleDateString(undefined, { month: 'short' });
    }
    // Week: show "DD MMM" of the week start
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  const chartData = points.map((p) => ({
    label: formatBucketLabel(p.periodStart),
    paidPounds: p.paidPence / 100,
    paidPence: p.paidPence,
    periodStart: p.periodStart,
  }));

  return (
    <div className="border rounded-md p-3 space-y-3" data-testid="card-earnings-trend">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm" data-testid="heading-earnings-trend">
            Earnings trend
          </h3>
        </div>
        <div className="inline-flex rounded-md border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => onPeriodChange('week')}
            className={`px-2.5 py-1 ${period === 'week' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground'}`}
            data-testid="button-trend-period-week"
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('month')}
            className={`px-2.5 py-1 border-l ${period === 'month' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground'}`}
            data-testid="button-trend-period-month"
          >
            Monthly
          </button>
        </div>
      </div>
      {isLoading && !trend ? (
        <div className="h-[160px] flex items-center justify-center" data-testid="text-trend-loading">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !hasAnyEarnings ? (
        <p className="text-xs text-muted-foreground py-6 text-center" data-testid="text-trend-empty">
          No paid-out earnings yet. Once your first transfer lands, it'll show up here.
        </p>
      ) : (
        <div className="h-[160px]" data-testid="chart-earnings-trend">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(v: number) => `£${Math.round(v)}`}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                formatter={(value: number | string) => [`£${Number(value).toFixed(2)}`, 'Paid out']}
                labelFormatter={(label: string | number) => String(label)}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="paidPounds" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function PayoutHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month'>('week');
  // Custom queryFn so the trendPeriod param is part of the URL.
  // Keeping the period in the queryKey lets React Query cache each
  // view separately and still invalidate cleanly via the prefix.
  const { data, isLoading, error } = useQuery<PayoutsResponse>({
    queryKey: ["/api/driver/payouts", { trendPeriod }],
    queryFn: async () => {
      const res = await fetch(`/api/driver/payouts?trendPeriod=${trendPeriod}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });
  const payouts = data?.payouts;
  const summary = data?.summary;
  const trend = data?.trend;

  const retryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/driver/payouts/${id}/retry`, {});
      return res.json();
    },
    onSuccess: (resp: any) => {
      if (resp?.status === 'transferred') {
        toast({ title: "Payout sent", description: "The transfer went through." });
      } else {
        toast({ title: "Retry submitted" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/driver/payouts"] });
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err?.message || "Try again later", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/payouts"] });
    },
  });

  // CSV export. We hit the endpoint with credentials, then synthesise
  // a download via an object URL so the browser respects our
  // Content-Disposition filename without navigating away from the
  // Payouts page (a plain <a href> would still work but loses the
  // SPA context if the request errors).
  const [isExporting, setIsExporting] = useState(false);
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/driver/payouts/export.csv', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      // Prefer the server-supplied filename from Content-Disposition;
      // fall back to a sensible default if it's missing.
      const disp = res.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="?([^";]+)"?/i);
      const today = new Date().toISOString().slice(0, 10);
      const filename = match?.[1] || `saviaj-payouts-${today}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message || 'Try again later', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const formatAmount = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(); } catch { return ""; }
  };

  const statusBadge = (status: string) => {
    if (status === 'transferred') {
      return <Badge className="bg-green-600 hover:bg-green-700" data-testid={`badge-payout-status-transferred`}><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    }
    if (status === 'failed') {
      return <Badge variant="destructive" data-testid={`badge-payout-status-failed`}><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    }
    if (status === 'pending') {
      return <Badge variant="secondary" data-testid={`badge-payout-status-pending`}><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
    if (status === 'reversed') {
      return <Badge variant="outline" data-testid={`badge-payout-status-reversed`}>Reversed</Badge>;
    }
    if (status === 'reversed_with_debt') {
      return <Badge variant="destructive" data-testid={`badge-payout-status-reversed-debt`}>Reversed (debt)</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  // Disable the export button when there's nothing transferred to
  // export — saves the driver from downloading an empty CSV.
  const hasTransferred = (summary?.paidLifetimePence ?? 0) > 0;

  return (
    <CardContent className="border-t pt-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm" data-testid="heading-payout-summary">Earnings summary</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={isExporting || !hasTransferred}
          data-testid="button-export-payouts-csv"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1" />
          )}
          Download CSV
        </Button>
      </div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="summary-payout-totals">
          <SummaryCard
            label="Paid this week"
            valuePence={summary.paidThisWeekPence}
            testId="summary-paid-week"
          />
          <SummaryCard
            label="Paid this month"
            valuePence={summary.paidThisMonthPence}
            testId="summary-paid-month"
          />
          <SummaryCard
            label="Lifetime earnings"
            valuePence={summary.paidLifetimePence}
            testId="summary-paid-lifetime"
            highlight
          />
          <SummaryCard
            label="Pending"
            valuePence={summary.pendingPence}
            testId="summary-pending"
          />
          <SummaryCard
            label="Failed (stuck)"
            valuePence={summary.failedStuckPence}
            testId="summary-failed-stuck"
            tone={summary.failedStuckPence > 0 ? 'danger' : undefined}
          />
        </div>
      )}
      <EarningsTrendChart
        trend={trend}
        period={trendPeriod}
        onPeriodChange={setTrendPeriod}
        isLoading={isLoading}
      />
      <div>
        <h3 className="font-semibold text-sm" data-testid="heading-payout-history">Payout history</h3>
        <p className="text-xs text-muted-foreground">
          One row per ride. Failed transfers can be retried once your Stripe account is active.
        </p>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : error ? (
        <p className="text-sm text-destructive" data-testid="text-payouts-error">Couldn't load payout history.</p>
      ) : !payouts || payouts.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-payouts-empty">
          No payouts yet. Completed rides will show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => (
            <div
              key={p.id}
              className="border rounded-md p-3 space-y-2"
              data-testid={`row-payout-${p.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium" data-testid={`text-payout-amount-${p.id}`}>
                      {formatAmount(p.amountPence)}
                    </span>
                    {statusBadge(p.status)}
                  </div>
                  {(p.pickupLocation || p.dropoffLocation) && (
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-payout-route-${p.id}`}>
                      {p.pickupLocation || "?"} → {p.dropoffLocation || "?"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid={`text-payout-date-${p.id}`}>
                    Ride #{p.rideId} · {formatDate(p.rideCompletedAt || p.createdAt)}
                  </p>
                </div>
                {p.status === 'failed' && (
                  <Button
                    size="sm"
                    onClick={() => retryMutation.mutate(p.id)}
                    disabled={retryMutation.isPending}
                    data-testid={`button-retry-payout-${p.id}`}
                  >
                    {retryMutation.isPending && retryMutation.variables === p.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Retry payout
                  </Button>
                )}
              </div>
              {p.status === 'failed' && p.failureReason && (
                <div
                  className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-900"
                  data-testid={`text-payout-failure-${p.id}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-600" />
                  <span>{p.failureReason}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CardContent>
  );
}

// ============================================================
// Identity verification (Stripe Identity) — driver-only.
// Hosted KYC flow. Clicking the button creates a verification
// session server-side, opens Stripe's hosted modal via
// stripe-js, and the result is webhook-driven. Polls
// /api/driver/kyc/status after the modal closes so the badge
// flips without a refresh.
// ============================================================
function IdentityVerificationSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/driver/kyc/status"],
    refetchInterval: 20_000,
  });
  const [verifying, setVerifying] = useState(false);

  const status: string = data?.kycStatus || "pending";
  const verified = status === "verified";

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/driver/kyc/stripe-identity/start", {});
      return res.json();
    },
    onSuccess: async (resp: any) => {
      if (!resp?.clientSecret) {
        toast({ title: "Couldn't start verification", variant: "destructive" });
        return;
      }
      setVerifying(true);
      try {
        const publishableKeyRes = await fetch("/api/stripe/publishable-key").then(r => r.json()).catch(() => null);
        const pk = publishableKeyRes?.publishableKey;
        if (!pk) {
          toast({ title: "Stripe not configured", description: "Missing publishable key", variant: "destructive" });
          return;
        }
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(pk);
        if (!stripe) {
          toast({ title: "Couldn't load Stripe", variant: "destructive" });
          return;
        }
        const result = await stripe.verifyIdentity(resp.clientSecret);
        if (result.error) {
          toast({ title: "Verification cancelled", description: result.error.message, variant: "destructive" });
        } else {
          toast({ title: "Verification submitted", description: "Stripe is reviewing your documents." });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/driver/kyc/status"] });
      } finally {
        setVerifying(false);
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't start verification", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-identity">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5" />
          Identity Verification
        </CardTitle>
        <CardDescription>
          Verify your identity with Stripe so passengers (and the law) know who's
          driving. You'll upload a photo of your ID and take a selfie inside Stripe's
          hosted flow — we never see the documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : verified ? (
          <Badge className="bg-green-600 hover:bg-green-700" data-testid="badge-identity-verified">
            <BadgeCheck className="h-3 w-3 mr-1" />
            Identity verified{data?.kycVerifiedAt ? ` on ${new Date(data.kycVerifiedAt).toLocaleDateString()}` : ""}
          </Badge>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm" data-testid="text-identity-status">
              <Badge variant="outline">Status: {status}</Badge>
              {data?.failureReason && (
                <span className="text-muted-foreground">— {data.failureReason}</span>
              )}
            </div>
            <Button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || verifying}
              data-testid="button-start-identity"
            >
              {(startMutation.isPending || verifying) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {status === "in_progress" || status === "requires_input" ? "Resume verification" : "Start verification"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
