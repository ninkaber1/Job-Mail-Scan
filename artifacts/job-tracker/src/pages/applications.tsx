import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListApplications, useDeleteApplication, getListApplicationsQueryKey, getGetApplicationsSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Search, Plus, Download, MoreHorizontal, Pencil, Trash2, 
  Mail, Video, Phone, Linkedin, Building2, HelpCircle
} from "lucide-react";
import { format } from "date-fns";

const methodIcons: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  zoom: <Video className="w-4 h-4" />,
  teams: <Video className="w-4 h-4" />,
  "google-meet": <Video className="w-4 h-4" />,
  phone: <Phone className="w-4 h-4" />,
  linkedin: <Linkedin className="w-4 h-4" />,
  other: <HelpCircle className="w-4 h-4" />
};

export default function ApplicationsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<string>("all");

  const queryParams = {
    ...(search ? { search } : {}),
    ...(resultFilter !== "all" ? { result: resultFilter } : {})
  };

  const { data: applications, isLoading } = useListApplications(queryParams, {
    query: {
      queryKey: getListApplicationsQueryKey(queryParams)
    }
  });

  const deleteApplication = useDeleteApplication();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this application?")) {
      deleteApplication.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Application deleted" });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetApplicationsSummaryQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to delete application", variant: "destructive" });
        }
      });
    }
  };

  const exportCSV = () => {
    if (!applications || applications.length === 0) return;
    
    const headers = ["Date", "Position", "Employer", "Contact Name", "Method", "Email", "Result"];
    const rows = applications.map(app => [
      format(new Date(app.dateOfContact), 'yyyy-MM-dd'),
      `"${app.position || ''}"`,
      `"${app.employer || ''}"`,
      `"${app.contactName || ''}"`,
      app.methodOfContact,
      app.emailAddress || '',
      app.result
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `applications-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">Manage and track all your job applications.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={exportCSV} disabled={!applications?.length}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Link href="/applications/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Manual
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search employer or position..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="interview">Interview</SelectItem>
              <SelectItem value="next-stage">Next Stage</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="no-response">No Response</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employer / Position</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : applications?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-foreground">No applications found</p>
                    <p>Try adjusting your search or add a new application.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              applications?.map((app) => (
                <TableRow key={app.id} className="group">
                  <TableCell className="whitespace-nowrap font-medium">
                    {format(new Date(app.dateOfContact), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">
                      {app.employer || "Unknown Employer"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {app.position || "Unknown Position"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {app.contactName && <div className="font-medium">{app.contactName}</div>}
                    {app.emailAddress && <div className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3"/>{app.emailAddress}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 capitalize text-muted-foreground">
                      {methodIcons[app.methodOfContact] || methodIcons.other}
                      {app.methodOfContact.replace('-', ' ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`
                        ${app.result === 'interview' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                        ${app.result === 'next-stage' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        ${app.result === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                        ${app.result === 'no-response' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
                      `}>
                      {app.result.replace('-', ' ').toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link href={`/applications/${app.id}`}>
                          <DropdownMenuItem className="cursor-pointer">
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer" onClick={() => handleDelete(app.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}