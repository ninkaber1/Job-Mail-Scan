import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { 
  LayoutDashboard, 
  Mail, 
  BriefcaseBusiness,
  Menu,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Applications", href: "/applications", icon: BriefcaseBusiness },
    { name: "Email Setup", href: "/connect", icon: Mail },
  ];

  const initials = user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}` : user?.emailAddresses?.[0]?.emailAddress ?? "";

  const NavLinks = ({ onSelect }: { onSelect?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link key={item.name} href={item.href} className="w-full" data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`} onClick={onSelect}>
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
    </>
  );

  const UserFooter = () => (
    <div className="border-t border-border p-4 flex items-center gap-3">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={user?.imageUrl} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-foreground">{displayName}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => signOut()}
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile Nav */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <BriefcaseBusiness className="w-5 h-5" />
          <span>Job Tracker</span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="btn-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <BriefcaseBusiness className="w-6 h-6" />
                  <span className="text-lg">Job Tracker</span>
                </div>
              </div>
              <nav className="p-4 flex flex-col gap-2 flex-1">
                <NavLinks onSelect={() => setMobileOpen(false)} />
              </nav>
              <UserFooter />
            </SheetContent>
          </Sheet>
        </div>
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
          <NavLinks />
        </nav>
        <UserFooter />
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
