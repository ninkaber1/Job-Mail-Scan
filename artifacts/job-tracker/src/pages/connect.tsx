import { z } from "zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import {
  useConnectEmail,
  useDisconnectEmail,
  useGetEmailStatus,
  useScanEmails,
  getGetEmailStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCcw,
  ExternalLink,
  Mail,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const connectFormSchema = z
  .object({
    provider: z.string().min(1, "Provider is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "App Password is required"),
    imapHost: z.string().optional(),
    imapPort: z.coerce.number().optional(),
  })
  .refine(
    (data) => {
      if (data.provider === "custom") {
        return !!data.imapHost && !!data.imapPort;
      }
      return true;
    },
    {
      message: "IMAP Host and Port are required for custom providers",
      path: ["imapHost"],
    },
  );

const scanFormSchema = z.object({
  daysBack: z.coerce.number().min(1).max(365).default(90),
  maxEmails: z.coerce.number().min(10).max(1000).default(200),
  clearPrevious: z.boolean().default(true),
});

export default function ConnectEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoaded: isUserLoaded } = useUser();

  const { data: status, isLoading: isStatusLoading } = useGetEmailStatus();
  const connectEmail = useConnectEmail();
  const disconnectEmail = useDisconnectEmail();
  const scanEmails = useScanEmails();

  // Check if server has Google OAuth credentials configured
  const { data: googleAuthStatus } = useQuery({
    queryKey: ["google-auth-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/google/status");
      return res.json() as Promise<{ configured: boolean }>;
    },
  });

  const googleAccount = isUserLoaded
    ? user?.externalAccounts?.find((a) => a.provider === "google")
    : null;
  const googleEmail = googleAccount?.emailAddress ?? null;

  const connectForm = useForm<z.infer<typeof connectFormSchema>>({
    resolver: zodResolver(connectFormSchema),
    defaultValues: {
      provider: "gmail",
      email: googleEmail ?? "",
      password: "",
      imapHost: "",
      imapPort: 993,
    },
  });

  const scanForm = useForm<z.infer<typeof scanFormSchema>>({
    resolver: zodResolver(scanFormSchema),
    defaultValues: { daysBack: 90, maxEmails: 200, clearPrevious: true },
  });

  const watchProvider = connectForm.watch("provider");

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });

  // Handle OAuth callback result from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "true") {
      toast({ title: "Gmail connected successfully!" });
      invalidateStatus();
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      const messages: Record<string, string> = {
        denied: "You cancelled the Google sign-in.",
        invalid: "Invalid OAuth response. Please try again.",
        invalid_state: "Security check failed. Please try again.",
        token_exchange: "Failed to get Gmail token. Please try again.",
        imap_failed:
          "Gmail IMAP connection failed even after authorization. Check that IMAP is enabled in Gmail settings.",
        no_email: "Could not determine your Gmail address. Please try again.",
        network: "Network error during authorization. Please try again.",
      };
      toast({
        title: "Gmail connection failed",
        description: messages[error] ?? "An unexpected error occurred.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnectWithGoogle = () => {
    const email = googleEmail ?? "";
    window.location.href = `/api/auth/google/authorize?email=${encodeURIComponent(email)}`;
  };

  const onConnect = (data: z.infer<typeof connectFormSchema>) => {
    connectEmail.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Email connected successfully!" });
          invalidateStatus();
        },
        onError: (err) => {
          toast({
            title: "Connection failed",
            description:
              err.data?.error ??
              err.message ??
              "Please check your credentials and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onDisconnect = () => {
    disconnectEmail.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Email disconnected" });
        invalidateStatus();
        connectForm.reset({ provider: "gmail", email: googleEmail ?? "" });
      },
    });
  };

  const onScan = (data: z.infer<typeof scanFormSchema>) => {
    scanEmails.mutate(
      { data },
      {
        onSuccess: (result) => {
          toast({
            title: "Scan complete",
            description: `Found ${result.found} job-related emails. Added ${result.added}, updated ${result.updated} applications.`,
          });
          invalidateStatus();
        },
        onError: (err) => {
          toast({
            title: "Scan failed",
            description:
              err.data?.error ??
              err.message ??
              "An error occurred while scanning.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isStatusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = status?.connected;
  const googleOAuthAvailable = googleAuthStatus?.configured === true;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Email Setup
        </h1>
        <p className="text-muted-foreground mt-2">
          Connect your email so AI can automatically find and track your job
          applications.
        </p>
      </div>

      {isConnected ? (
        <div className="space-y-6">
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <div>
                  <CardTitle className="text-green-800">Connected</CardTitle>
                  <CardDescription className="text-green-700">
                    Your email is ready to scan for job applications.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="font-medium text-foreground">
                    {status.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="font-medium text-foreground capitalize">
                    {status.provider}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last Scanned</dt>
                  <dd className="font-medium text-foreground">
                    {status.lastScanned
                      ? formatDistanceToNow(new Date(status.lastScanned), {
                          addSuffix: true,
                        })
                      : "Never"}
                  </dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter className="border-t border-green-200/50 pt-4">
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={onDisconnect}
                disabled={disconnectEmail.isPending}
              >
                {disconnectEmail.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Disconnect
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scan Inbox</CardTitle>
              <CardDescription>
                Trigger a manual scan of your inbox for job-related emails.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...scanForm}>
                <form
                  onSubmit={scanForm.handleSubmit(onScan)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={scanForm.control}
                      name="daysBack"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Days Back</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={scanForm.control}
                      name="maxEmails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Emails</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={scanForm.control}
                    name="clearPrevious"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
                        <FormControl>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                          />
                        </FormControl>
                        <div className="space-y-0.5">
                          <FormLabel className="cursor-pointer">
                            Replace results from before this scan window
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            When checked, applications older than {scanForm.watch("daysBack")} days are removed so the dashboard only shows what was found in this scan. Uncheck to keep older results.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={scanEmails.isPending}>
                    {scanEmails.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCcw className="w-4 h-4 mr-2" />
                    )}
                    Scan Now
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Google OAuth (modern, secure) ────────────────────────── */}
          {googleOAuthAvailable && (
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle>Connect Gmail — Recommended</CardTitle>
                <CardDescription>
                  Sign in with Google once. No passwords stored.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={onConnectWithGoogle}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>
              </CardContent>
            </Card>
          )}

          {googleOAuthAvailable && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-sm text-muted-foreground">
                or use an App Password
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          {/* ── App Password (fallback) ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                {googleOAuthAvailable ? "Connect with App Password" : "Connect Your Email"}
              </CardTitle>
              <CardDescription>
                Works with Gmail, Outlook, Yahoo, iCloud, and any IMAP provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...connectForm}>
                <form
                  onSubmit={connectForm.handleSubmit(onConnect)}
                  className="space-y-6"
                >
                  <FormField
                    control={connectForm.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="gmail">Gmail</SelectItem>
                            <SelectItem value="outlook">Outlook</SelectItem>
                            <SelectItem value="yahoo">Yahoo</SelectItem>
                            <SelectItem value="icloud">iCloud</SelectItem>
                            <SelectItem value="custom">Custom IMAP</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={connectForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input placeholder="you@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={connectForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>App Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="16-character app password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchProvider === "custom" && (
                    <div className="grid gap-4 sm:grid-cols-2 p-4 bg-muted/50 rounded-lg">
                      <FormField
                        control={connectForm.control}
                        name="imapHost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IMAP Host</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="imap.example.com"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectForm.control}
                        name="imapPort"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IMAP Port</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="993"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {watchProvider === "gmail" && (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-800">
                        Gmail requires an App Password
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 text-sm space-y-2">
                        <p>
                          Gmail blocks your regular password for IMAP access.
                          Create an App Password instead:
                        </p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>
                            Enable <strong>2-Step Verification</strong> on your
                            Google Account
                          </li>
                          <li>
                            Go to{" "}
                            <strong>
                              myaccount.google.com → Security → App passwords
                            </strong>
                          </li>
                          <li>
                            Create a new App Password (select "Mail" and your
                            device)
                          </li>
                          <li>Paste the 16-character password above</li>
                        </ol>
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-amber-800 font-medium underline underline-offset-2 hover:text-amber-900 mt-1"
                        >
                          Open Google App Passwords
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}

                  {watchProvider === "outlook" && (
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800">
                        Outlook App Password
                      </AlertTitle>
                      <AlertDescription className="text-blue-700 text-sm">
                        If 2FA is enabled, go to{" "}
                        <strong>
                          account.microsoft.com → Security → Advanced security
                          options → App passwords
                        </strong>{" "}
                        to create one.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={connectEmail.isPending}
                  >
                    {connectEmail.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Connect Email
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
