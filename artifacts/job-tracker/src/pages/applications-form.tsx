import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useGetApplication, 
  useCreateApplication, 
  useUpdateApplication,
  getGetApplicationQueryKey,
  getListApplicationsQueryKey,
  getGetApplicationsSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft } from "lucide-react";

const formSchema = z.object({
  dateOfContact: z.string().min(1, "Date is required"),
  position: z.string().nullable().optional(),
  employer: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  methodOfContact: z.string().min(1, "Method is required"),
  emailAddress: z.string().email("Invalid email").nullable().optional().or(z.literal("")),
  result: z.string().min(1, "Status is required"),
  notes: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ApplicationForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isEditing = !!id && id !== "new";
  const numId = parseInt(id || "0", 10);

  const { data: application, isLoading: isFetching } = useGetApplication(numId, {
    query: {
      enabled: isEditing,
      queryKey: getGetApplicationQueryKey(numId)
    }
  });

  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dateOfContact: format(new Date(), 'yyyy-MM-dd'),
      position: "",
      employer: "",
      contactName: "",
      methodOfContact: "email",
      emailAddress: "",
      result: "no-response",
      notes: "",
    }
  });

  useEffect(() => {
    if (application && isEditing) {
      form.reset({
        dateOfContact: application.dateOfContact,
        position: application.position || "",
        employer: application.employer || "",
        contactName: application.contactName || "",
        methodOfContact: application.methodOfContact,
        emailAddress: application.emailAddress || "",
        result: application.result,
        notes: application.notes || "",
      });
    }
  }, [application, isEditing, form]);

  const onSubmit = (data: FormValues) => {
    // Clean up empty strings to null for optional fields
    const payload = {
      ...data,
      position: data.position || null,
      employer: data.employer || null,
      contactName: data.contactName || null,
      emailAddress: data.emailAddress || null,
      notes: data.notes || null,
    };

    if (isEditing) {
      updateMutation.mutate({ id: numId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Application updated successfully" });
          queryClient.invalidateQueries({ queryKey: getGetApplicationQueryKey(numId) });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetApplicationsSummaryQueryKey() });
          setLocation("/applications");
        },
        onError: () => {
          toast({ title: "Failed to update application", variant: "destructive" });
        }
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Application created successfully" });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetApplicationsSummaryQueryKey() });
          setLocation("/applications");
        },
        onError: () => {
          toast({ title: "Failed to create application", variant: "destructive" });
        }
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isFetching) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => setLocation("/applications")} className="mb-4 -ml-4 text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Applications
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditing ? "Edit Application" : "New Application"}
        </h1>
      </div>

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField control={form.control} name="employer" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employer / Company</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="position" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position / Role</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="dateOfContact" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="result" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="interview">Interview</SelectItem>
                        <SelectItem value="next-stage">Next Stage</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="applied">Applied</SelectItem>
                        <SelectItem value="no-response">No Response</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="my-6 border-t border-border pt-6">
                <h3 className="text-lg font-medium mb-4">Contact Details</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField control={form.control} name="contactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name</FormLabel>
                      <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="emailAddress" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl><Input type="email" {...field} value={field.value || ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="methodOfContact" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="linkedin">LinkedIn</SelectItem>
                          <SelectItem value="zoom">Zoom</SelectItem>
                          <SelectItem value="teams">Microsoft Teams</SelectItem>
                          <SelectItem value="google-meet">Google Meet</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Any additional context, interview notes, etc." 
                        className="min-h-[120px]"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-6">
                <Button type="button" variant="outline" onClick={() => setLocation("/applications")} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isEditing ? "Save Changes" : "Create Application"}
                </Button>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}