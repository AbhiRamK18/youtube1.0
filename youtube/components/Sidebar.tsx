"use client";

import {
  Clock,
  Compass,
  Download,
  History,
  Home,
  PlaySquare,
  ThumbsUp,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import Channeldialogue from "./channeldialogue";
import { useUser } from "@/lib/AuthContext";

type LinkItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

function SidebarLinks({
  items,
  compact = false,
  onNavigate,
}: {
  items: LinkItem[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onNavigate} title={compact ? label : undefined}>
          <Button
            variant="ghost"
            className={`h-11 w-full justify-start ${
              compact ? "justify-center px-2 xl:justify-start xl:px-4" : ""
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${compact ? "xl:mr-3" : "mr-3"}`} />
            <span className={compact ? "hidden xl:inline" : ""}>{label}</span>
          </Button>
        </Link>
      ))}
    </nav>
  );
}

const Sidebar = ({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) => {
  const { user } = useUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const mainLinks: LinkItem[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/subscriptions", label: "Subscriptions", icon: PlaySquare },
    { href: "/calls", label: "Video calls", icon: Video },
  ];
  const libraryLinks: LinkItem[] = user
    ? [
        { href: "/history", label: "History", icon: History },
        { href: "/liked", label: "Liked videos", icon: ThumbsUp },
        { href: "/watch-later", label: "Watch later", icon: Clock },
        { href: "/downloads", label: "Downloads", icon: Download },
        ...(user.channelname
          ? [{ href: `/channel/${user._id}`, label: "Your channel", icon: User }]
          : [])
      ]
    : [];

  return (
    <>
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-16 shrink-0 overflow-y-auto border-r bg-background p-2 lg:block xl:w-64">
        <SidebarLinks items={mainLinks} compact />
        {user && (
          <div className="mt-2 border-t pt-2">
            <SidebarLinks items={libraryLinks} compact />
            {!user.channelname && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2 w-full px-1 text-xs xl:px-3 xl:text-sm"
                title="Create Channel"
                onClick={() => setIsDialogOpen(true)}
              >
                <span className="xl:hidden">+</span>
                <span className="hidden xl:inline">Create Channel</span>
              </Button>
            )}
          </div>
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 h-full w-full bg-black/50"
            onClick={onMobileClose}
          />
          <aside
            id="mobile-navigation"
            aria-label="Main navigation"
            className="relative h-full w-72 max-w-[85vw] overflow-y-auto border-r bg-background p-3 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between border-b pb-3">
              <span className="font-semibold">YourTube</span>
              <Button variant="ghost" size="sm" onClick={onMobileClose}>
                Close
              </Button>
            </div>
            <SidebarLinks items={mainLinks} onNavigate={onMobileClose} />
            {user && (
              <div className="mt-2 border-t pt-2">
                <SidebarLinks
                  items={libraryLinks}
                  onNavigate={onMobileClose}
                />
                {!user.channelname && (
                  <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={() => {
                      onMobileClose();
                      setIsDialogOpen(true);
                    }}
                  >
                    Create Channel
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {[
          { href: "/", label: "Home", icon: Home },
          { href: "/explore", label: "Explore", icon: Compass },
          { href: "/subscriptions", label: "Subs", icon: PlaySquare },
          { href: "/history", label: "History", icon: History },
          { href: "/watch-later", label: "Library", icon: Clock },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-muted-foreground"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] leading-none">{label}</span>
          </Link>
        ))}
      </nav>

      <Channeldialogue
        key={`${isDialogOpen}-${user?.name || ""}`}
        isopen={isDialogOpen}
        onclose={() => setIsDialogOpen(false)}
        mode="create"
      />
    </>
  );
};

export default Sidebar;
