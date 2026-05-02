import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@clerk/react";
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
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCcw,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
});

export default function ConnectEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoaded: isUserLoaded } = useUser();

  const { data: status, isLoading: isStatusLoading } = useGetEmailStatus();
  const connectEmail = useConnectEmail();
  const disconnectEmail = useDisconnectEmail();
  const scanEmails = useScanEmails();

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
    defaultValues: { daysBack: 90, maxEmails: 200 },
  });

  const watchProvider = connectForm.watch("provider");

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() });

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
          <Card>
            <CardHeader>
              <CardTitle>Connect Your Email</CardTitle>
              <CardDescription>
                We use IMAP to read your inbox. We never store your emails —
                only the job application data extracted from them.
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
                          Gmail blocks your regular password for IMAP. You need
                          to create a 16-character App Password:
                        </p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>
                            Enable{" "}
                            <strong>2-Step Verification</strong> on your Google
                            Account
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
                          <li>
                            Paste the 16-character password into the field above
                          </li>
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
