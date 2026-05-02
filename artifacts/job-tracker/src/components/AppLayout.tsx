import { z } from "zod";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Mail, 
  BriefcaseBusiness,
  Menu,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Applications", href: "/applications", icon: BriefcaseBusiness },
    { name: "Email Setup", href: "/connect", icon: Mail },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile Nav */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <BriefcaseBusiness className="w-5 h-5" />
          <span>Job Tracker</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="btn-mobile-menu">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <BriefcaseBusiness className="w-6 h-6" />
                <span className="text-lg">Job Tracker</span>
              </div>
            </div>
            <nav className="p-4 flex flex-col gap-2">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.name} href={item.href} className="w-full" data-testid={`nav-${item.name.toLowerCase()}`}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card text-card-foreground">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold">
            <BriefcaseBusiness className="w-6 h-6" />
            <span className="text-xl">Job Tracker</span>
          </div>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} data-testid={`nav-desktop-${item.name.toLowerCase().replace(' ', '-')}`}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3 h-10"
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Button>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative h-[100dvh] md:h-auto md:min-h-screen">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}