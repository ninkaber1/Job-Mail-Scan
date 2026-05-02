import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Mail, CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCcw } from "lucide-react";
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

  const onScan = (data: z.infer<typeof scanFormSchema>) => {
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
                  <dd className="font-medium text-foreground capitalize">{status.provider}</dd>
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
                  <Button type="submit" disabled={scanEmails.isPending}>
                    {scanEmails.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                    Scan Inbox Now
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connect Account</CardTitle>
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
      )}
    </div>
  );
}