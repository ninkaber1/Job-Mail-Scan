import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@clerk/react";
import { 
  useConnectEmail, 
  useDisconnectEmail, 
  useGetEmailStatus, 
  useScanEmails,
  getGetEmailStatusQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const connectFormSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "App Password is required"),
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().optional(),
}).refine(data => {
  if (data.provider === 'custom') {
    return !!data.imapHost && !!data.imapPort;
  }
  return true;
}, {
  message: "IMAP Host and Port are required for custom providers",
  path: ["imapHost"],
});

const scanFormSchema = z.object({
  daysBack: z.coerce.number().min(1).max(365).default(30),
  maxEmails: z.coerce.number().min(10).max(1000).default(200),
});

export default function ConnectEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isOAuthConnecting, setIsOAuthConnecting] = useState(false);
  const [isOAuthScanning, setIsOAuthScanning] = useState(false);
  
  const { data: status, isLoading: isStatusLoading } = useGetEmailStatus();
  const connectEmail = useConnectEmail();
  const disconnectEmail = useDisconnectEmail();
  const scanEmails = useScanEmails();

  const connectForm = useForm<z.infer<typeof connectFormSchema>>({
    resolver: zodResolver(connectFormSchema),
    defaultValues: {
      provider: "gmail",
      email: "",
      password: "",
      imapHost: "",
      imapPort: 993,
    },
  });

  const scanForm = useForm<z.infer<typeof scanFormSchema>>({
    resolver: zodResolver(scanFormSchema),
    defaultValues: {
      daysBack: 30,
      maxEmails: 200,
    },
  });

  const watchProvider = connectForm.watch("provider");

  const googleAccount = isUserLoaded
    ? user?.externalAccounts?.find(a => a.provider === "google")
    : null;
  const googleEmail = googleAccount?.emailAddress ?? null;
  const isGoogleUser = !!googleAccount;

  const getGoogleOAuthToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const tokens = await user.getOauthAccessToken("oauth_google");
      return tokens?.[0]?.token ?? null;
    } catch (err) {
      return null;
    }
  };

  const onConnectWithGoogle = async () => {
    if (!googleEmail) return;
    setIsOAuthConnecting(true);
    try {
      const oauthToken = await getGoogleOAuthToken();
      if (!oauthToken) {
        toast({
          title: "Google access unavailable",
          description: "Could not get a Google access token. Try connecting with an App Password instead.",
          variant: "destructive",
        });
        return;
      }
      connectEmail.mutate(
        { data: { provider: "gmail", email: googleEmail, oauthToken } },
        {
          onSuccess: () => {
            toast({ title: "Gmail connected with Google!" });
            queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });
          },
          onError: (err) => {
            toast({
              title: "Connection failed",
              description: err.error || "Could not connect to Gmail with Google. Try an App Password instead.",
              variant: "destructive",
            });
          },
        }
      );
    } finally {
      setIsOAuthConnecting(false);
    }
  };

  const onConnect = (data: z.infer<typeof connectFormSchema>) => {
    connectEmail.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Email connected successfully!" });
        queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });
      },
      onError: (err) => {
        toast({ 
          title: "Connection failed", 
          description: err.error || "Please check your credentials and try again.",
          variant: "destructive" 
        });
      }
    });
  };

  const onDisconnect = () => {
    disconnectEmail.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Email disconnected" });
        queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });
        connectForm.reset();
      }
    });
  };

  const onScan = async (data: z.infer<typeof scanFormSchema>) => {
    const isOAuth = status?.connected && googleEmail && status.email === googleEmail;

    if (isOAuth) {
      setIsOAuthScanning(true);
      try {
        const oauthToken = await getGoogleOAuthToken();
        if (!oauthToken) {
          toast({
            title: "Google token unavailable",
            description: "Could not get a fresh Google token. Please reconnect your email.",
            variant: "destructive",
          });
          return;
        }
        scanEmails.mutate({ data: { ...data, oauthToken } }, {
          onSuccess: (result) => {
            toast({
              title: "Scan Complete",
              description: `Found ${result.found} emails. Added ${result.added} and updated ${result.updated} applications.`,
            });
            queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });
          },
          onError: (err) => {
            toast({
              title: "Scan failed",
              description: err.error || "An error occurred while scanning emails.",
              variant: "destructive",
            });
          },
        });
      } finally {
        setIsOAuthScanning(false);
      }
    } else {
      scanEmails.mutate({ data }, {
        onSuccess: (result) => {
          toast({ 
            title: "Scan Complete", 
            description: `Found ${result.found} emails. Added ${result.added} and updated ${result.updated} applications.` 
          });
          queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });
        },
        onError: (err) => {
          toast({ 
            title: "Scan failed", 
            description: err.error || "An error occurred while scanning emails.",
            variant: "destructive" 
          });
        }
      });
    }
  };

  if (isStatusLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const isConnected = status?.connected;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Email Setup</h1>
        <p className="text-muted-foreground mt-2">
          Connect your email to let AI automatically find and track your job applications.
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
                  <CardDescription className="text-green-700">Your email is actively being tracked.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="font-medium text-foreground">{status.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="font-medium text-foreground flex items-center gap-2">
                    <span className="capitalize">{status.provider}</span>
                    {isGoogleUser && status.email === googleEmail && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Sparkles className="w-3 h-3" /> Google OAuth
                      </Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last Scanned</dt>
                  <dd className="font-medium text-foreground">
                    {status.lastScanned ? formatDistanceToNow(new Date(status.lastScanned), { addSuffix: true }) : "Never"}
                  </dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-green-200/50 pt-4">
              <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onDisconnect} disabled={disconnectEmail.isPending}>
                {disconnectEmail.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Disconnect
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Scan</CardTitle>
              <CardDescription>Trigger a manual scan of your inbox right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...scanForm}>
                <form onSubmit={scanForm.handleSubmit(onScan)} className="space-y-4">
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
                          <FormLabel>Max Emails to Scan</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={scanEmails.isPending || isOAuthScanning}>
                    {(scanEmails.isPending || isOAuthScanning) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                    Scan Inbox Now
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {isGoogleUser && googleEmail && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-base">Connect Gmail with Google</CardTitle>
                    <CardDescription>Use your existing Google sign-in — no app password needed.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3 mb-4 p-3 bg-white rounded-lg border border-gray-100">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground font-medium">{googleEmail}</span>
                  <Badge variant="outline" className="ml-auto text-xs">Gmail</Badge>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={onConnectWithGoogle}
                  disabled={isOAuthConnecting || connectEmail.isPending}
                >
                  {(isOAuthConnecting || connectEmail.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Connect Gmail with Google
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{isGoogleUser ? "Or Connect with App Password" : "Connect Account"}</CardTitle>
              <CardDescription>We use IMAP to securely read your emails. We do not store your emails, only the extracted application data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...connectForm}>
                <form onSubmit={connectForm.handleSubmit(onConnect)} className="space-y-6">
                  
                  <FormField
                    control={connectForm.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="gmail"><div className="flex items-center gap-2"><Mail className="w-4 h-4" /> Gmail</div></SelectItem>
                            <SelectItem value="outlook"><div className="flex items-center gap-2"><Mail className="w-4 h-4" /> Outlook</div></SelectItem>
                            <SelectItem value="yahoo"><div className="flex items-center gap-2"><Mail className="w-4 h-4" /> Yahoo</div></SelectItem>
                            <SelectItem value="icloud"><div className="flex items-center gap-2"><Mail className="w-4 h-4" /> iCloud</div></SelectItem>
                            <SelectItem value="custom"><div className="flex items-center gap-2"><Mail className="w-4 h-4" /> Custom IMAP</div></SelectItem>
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
                            <Input type="password" placeholder="App Password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchProvider === 'custom' && (
                    <div className="grid gap-4 sm:grid-cols-2 p-4 bg-muted/50 rounded-lg">
                      <FormField
                        control={connectForm.control}
                        name="imapHost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IMAP Host</FormLabel>
                            <FormControl>
                              <Input placeholder="imap.example.com" {...field} value={field.value || ''} />
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
                              <Input type="number" placeholder="993" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {watchProvider === 'gmail' && (
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800">App Password Required</AlertTitle>
                      <AlertDescription className="text-blue-700 text-sm">
                        For Gmail, you cannot use your regular password. <br/>
                        1. Enable 2-Step Verification in your Google Account<br/>
                        2. Go to Security &gt; 2-Step Verification &gt; App passwords<br/>
                        3. Create a new app password and paste it here.
                      </AlertDescription>
                    </Alert>
                  )}

                  {watchProvider === 'outlook' && (
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800">App Password Required</AlertTitle>
                      <AlertDescription className="text-blue-700 text-sm">
                        For Outlook/Hotmail, you cannot use your regular password if 2FA is enabled.<br/>
                        1. Go to account.microsoft.com &gt; Security &gt; Advanced security options<br/>
                        2. Scroll down to App passwords and create a new one.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={connectEmail.isPending}>
                    {connectEmail.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
