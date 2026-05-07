import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActivity,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
  getListActivityQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, Download, ClipboardList } from "lucide-react";
import type { ActivityEntry } from "@workspace/api-client-react";

type FormState = { date: string; description: string };

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function exportCsv(entries: ActivityEntry[]) {
  const header = "Date,Description";
  const rows = entries.map(
    (e) =>
      `"${e.date}","${(e.description ?? "").replace(/"/g, '""')}"`,
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-log-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ActivityLog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListActivityQueryKey() });

  const { data: entries = [], isLoading } = useListActivity();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>({ date: today(), description: "" });

  const [editEntry, setEditEntry] = useState<ActivityEntry | null>(null);
  const [editForm, setEditForm] = useState<FormState>({ date: "", description: "" });

  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openEdit(entry: ActivityEntry) {
    setEditEntry(entry);
    setEditForm({ date: entry.date, description: entry.description });
  }

  function handleAdd() {
    if (!addForm.date || !addForm.description.trim()) {
      toast({ title: "Date and description are required.", variant: "destructive" });
      return;
    }
    createActivity.mutate(
      { data: { date: addForm.date, description: addForm.description.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setShowAdd(false);
          setAddForm({ date: today(), description: "" });
          toast({ title: "Entry added." });
        },
        onError: () => toast({ title: "Failed to add entry.", variant: "destructive" }),
      },
    );
  }

  function handleEdit() {
    if (!editEntry) return;
    if (!editForm.date || !editForm.description.trim()) {
      toast({ title: "Date and description are required.", variant: "destructive" });
      return;
    }
    updateActivity.mutate(
      { id: editEntry.id, data: { date: editForm.date, description: editForm.description.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setEditEntry(null);
          toast({ title: "Entry updated." });
        },
        onError: () => toast({ title: "Failed to update entry.", variant: "destructive" }),
      },
    );
  }

  function handleDelete() {
    if (deleteId === null) return;
    deleteActivity.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          invalidate();
          setDeleteId(null);
          toast({ title: "Entry deleted." });
        },
        onError: () => toast({ title: "Failed to delete entry.", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track your job search activities — networking, outreach, research, and more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportCsv(entries)}
            disabled={entries.length === 0}
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No activity logged yet</p>
            <p className="text-xs text-muted-foreground/70">
              Add entries for networking, informational interviews, job fairs, cold outreach, and more.
            </p>
            <Button size="sm" className="mt-1 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add your first entry
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-36">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="group">
                  <TableCell className="font-mono text-sm text-muted-foreground whitespace-nowrap">
                    {entry.date}
                  </TableCell>
                  <TableCell className="text-sm">{entry.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(entry.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Activity Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-date">Date</Label>
              <Input
                id="add-date"
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-description">Description</Label>
              <Textarea
                id="add-description"
                placeholder="e.g. Reached out to recruiter at Acme Corp via LinkedIn"
                rows={3}
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={createActivity.isPending}>
              {createActivity.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Activity Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleEdit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateActivity.isPending}>
              {updateActivity.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
