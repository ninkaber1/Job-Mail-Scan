import { useState, useRef } from "react";
import { Link } from "wouter";
import {
  useListApplications,
  useDeleteApplication,
  useUpdateApplication,
  getListApplicationsQueryKey,
  getGetApplicationsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Download,
  Pencil,
  Trash2,
  Mail,
  Video,
  Phone,
  Linkedin,
  Building2,
  HelpCircle,
} from "lucide-react";
import { format } from "date-fns";

const methodIcons: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  zoom: <Video className="w-4 h-4" />,
  teams: <Video className="w-4 h-4" />,
  "google-meet": <Video className="w-4 h-4" />,
  phone: <Phone className="w-4 h-4" />,
  linkedin: <Linkedin className="w-4 h-4" />,
  other: <HelpCircle className="w-4 h-4" />,
};

function CommentCell({ id, value }: { id: number; value: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const queryClient = useQueryClient();
  const updateApplication = useUpdateApplication();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = () => {
    const newVal = draft.trim() || null;
    if (newVal === (value ?? null)) {
      setEditing(false);
      return;
    }
    updateApplication.mutate(
      { id, data: { comment: newVal } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          setEditing(false);
        },
        onError: () => setEditing(false),
      },
    );
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className="w-full min-w-[160px] text-sm rounded border border-input bg-background px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        rows={3}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          if (e.key === "Enter" && e.ctrlKey) save();
        }}
      />
    );
  }

  return (
    <button
      className="w-full text-left text-sm min-w-[120px] min-h-[32px] rounded px-1 hover:bg-muted/50 transition-colors"
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      title="Click to edit comment"
    >
      {value ? (
        <span className="text-foreground whitespace-pre-wrap">{value}</span>
      ) : (
        <span className="text-muted-foreground/40 italic">Add comment…</span>
      )}
    </button>
  );
}

export default function ApplicationsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const queryParams = {
    ...(search ? { search } : {}),
    ...(resultFilter !== "all" ? { result: resultFilter } : {}),
  };

  const { data: applications, isLoading } = useListApplications(queryParams, {
    query: { queryKey: getListApplicationsQueryKey(queryParams) },
  });

  const deleteApplication = useDeleteApplication();

  const confirmDelete = () => {
    if (deleteId === null) return;
    deleteApplication.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Application deleted" });
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetApplicationsSummaryQueryKey() });
          setDeleteId(null);
        },
        onError: () => {
          toast({ title: "Failed to delete application", variant: "destructive" });
          setDeleteId(null);
        },
      },
    );
  };

  const exportCSV = () => {
    if (!applications || applications.length === 0) return;
    const headers = ["Date", "Position", "Employer", "Contact Name", "Method", "Email", "Result", "Comment"];
    const rows = applications.map((app) => [
      format(new Date(app.dateOfContact), "yyyy-MM-dd"),
      `"${app.position || ""}"`,
      `"${app.employer || ""}"`,
      `"${app.contactName || ""}"`,
      app.methodOfContact,
      app.emailAddress || "",
      app.result,
      `"${(app.comment || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `applications-${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this application record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="no-response">No Response</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead>Employer / Position</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[180px]">Comment</TableHead>
              <TableHead className="w-[88px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))
            ) : applications?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-foreground">No applications found</p>
                    <p>Try adjusting your search or add a new application.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              applications?.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="whitespace-nowrap font-medium align-top pt-3">
                    {format(new Date(app.dateOfContact), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="align-top pt-3">
                    <div className="font-semibold text-foreground">
                      {app.employer || "Unknown Employer"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {app.position || "Unknown Position"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm align-top pt-3">
                    {app.interviewerInfo ? (
                      <span className="text-foreground">{app.interviewerInfo}</span>
                    ) : app.contactName ? (
                      <span className="text-muted-foreground">{app.contactName}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top pt-3">
                    {app.emailAddress ? (
                      <div className="text-sm flex items-center gap-1 text-muted-foreground">
                        <Mail className="w-3 h-3 shrink-0" />
                        {app.emailAddress}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/40 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top pt-3">
                    <div className="flex items-center gap-2 capitalize text-muted-foreground">
                      {methodIcons[app.methodOfContact] || methodIcons.other}
                      <span className="hidden sm:inline">{app.methodOfContact.replace("-", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-3">
                    <Badge
                      variant="outline"
                      className={`whitespace-nowrap
                        ${app.result === "interview" ? "bg-green-50 text-green-700 border-green-200" : ""}
                        ${app.result === "next-stage" ? "bg-blue-50 text-blue-700 border-blue-200" : ""}
                        ${app.result === "rejected" ? "bg-red-50 text-red-700 border-red-200" : ""}
                        ${app.result === "applied" ? "bg-purple-50 text-purple-700 border-purple-200" : ""}
                        ${app.result === "no-response" ? "bg-gray-100 text-gray-700 border-gray-200" : ""}
                      `}
                    >
                      {app.result.replace(/-/g, " ").toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top pt-2">
                    <CommentCell id={app.id} value={app.comment ?? null} />
                  </TableCell>
                  <TableCell className="align-top pt-2">
                    <div className="flex items-center gap-1">
                      <Link href={`/applications/${app.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeleteId(app.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
