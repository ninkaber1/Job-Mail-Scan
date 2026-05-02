import { Link } from "wouter";
import { useGetApplicationsSummary, useGetEmailStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BriefcaseBusiness, Mail, ArrowRight, User, Building2, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetApplicationsSummary();
  const { data: emailStatus, isLoading: isLoadingEmail } = useGetEmailStatus();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your job application pipeline.
        </p>
      </div>

      {!isLoadingEmail && emailStatus && !emailStatus.connected && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-primary">Connect your email to automate tracking</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Scan your inbox for job applications, interview invites, and rejections automatically.
              </p>
            </div>
            <Link href="/connect" data-testid="link-connect-email">
              <Button>
                <Mail className="w-4 h-4 mr-2" />
                Connect Email
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Applications</CardDescription>
            <CardTitle className="text-3xl">
              {isLoadingSummary ? <Skeleton className="h-9 w-16" /> : summary?.total || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Next Stage</CardDescription>
            <CardTitle className="text-3xl text-blue-700">
              {isLoadingSummary ? <Skeleton className="h-9 w-16" /> : summary?.byResult?.nextStage || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription>Interviews</CardDescription>
            <CardTitle className="text-3xl text-green-700">
              {isLoadingSummary ? <Skeleton className="h-9 w-16" /> : summary?.byResult?.interview || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
            <CardTitle className="text-3xl text-red-700">
              {isLoadingSummary ? <Skeleton className="h-9 w-16" /> : summary?.byResult?.rejected || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardHeader className="pb-2">
            <CardDescription>No Response</CardDescription>
            <CardTitle className="text-3xl text-gray-700">
              {isLoadingSummary ? <Skeleton className="h-9 w-16" /> : summary?.byResult?.noResponse || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest job applications</CardDescription>
            </div>
            <Link href="/applications">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                View All <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : summary?.recentActivity && summary.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {summary.recentActivity.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex gap-4">
                      <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                        <BriefcaseBusiness className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <Link href={`/applications/${app.id}`} className="font-semibold hover:underline cursor-pointer block">
                          {app.position || "Unknown Position"}
                        </Link>
                        <div className="flex items-center text-sm text-muted-foreground mt-1 gap-3">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {app.employer || "Unknown Employer"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(app.dateOfContact), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Badge variant="outline" className={`
                        ${app.result === 'interview' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                        ${app.result === 'next-stage' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        ${app.result === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                        ${app.result === 'no-response' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
                      `}>
                        {app.result.replace('-', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 opacity-20 mb-4" />
                <p>No applications tracked yet.</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Link href="/connect">
                    <Button variant="outline" size="sm">Connect Email</Button>
                  </Link>
                  <Link href="/applications/new">
                    <Button size="sm">Add Application</Button>
                  </Link>
                </div>
              </div>
            )}
            <Link href="/applications" className="sm:hidden block mt-4">
              <Button variant="outline" className="w-full">
                View All <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}