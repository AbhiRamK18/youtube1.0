"use client";
import { Bell, Menu, Mic, Moon, Search, Sun, User, VideoIcon } from "lucide-react";
import React, { useState } from "react";
import { Button } from "./ui/button";
import Link from "next/link";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import Channeldialogue from "./channeldialogue";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/AuthContext";
import { useTheme } from "next-themes";
import { toast } from "sonner";

const Header = () => {
  const {
    user,
    logout,
    handlegooglesignin,
    pendingVerification,
    verifyLogin,
    resendLoginCode,
    authError,
    isSigningIn,
    changeThemePreference,
  } = useUser();
  // const user: any = {
  //   id: "1",
  //   name: "John Doe",
  //   email: "john@example.com",
  //   image: "https://github.com/shadcn.png?height=32&width=32",
  // };
  const [searchQuery, setSearchQuery] = useState("");
  const [isdialogeopen, setisdialogeopen] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [securityError, setSecurityError] = useState("");
  const router = useRouter();
  const { theme } = useTheme();

  const handleVerifyLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSecurityError("");
    const verified = await verifyLogin(verificationCode);
    if (!verified) setSecurityError(authError || "The code could not be verified.");
  };

  const handleThemeChange = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    try {
      await changeThemePreference(nextTheme);
    } catch (error) {
      console.error("Unable to save theme preference:", error);
      toast.error("Unable to save your theme preference. Please retry.");
    }
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-background border-b">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <Menu className="w-6 h-6" />
        </Button>
        <Link href="/" className="flex items-center gap-1">
          <div className="bg-red-600 p-1 rounded">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <span className="text-xl font-medium">YourTube</span>
          <span className="text-xs text-gray-400 ml-1">IN</span>
        </Link>
      </div>
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 flex-1 max-w-2xl mx-4"
      >
        <div className="flex flex-1">
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-l-full border-r-0 focus-visible:ring-0"
          />
          <Button
            type="submit"
            className="rounded-r-full px-6 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-l-0"
          >
            <Search className="w-5 h-5" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Mic className="w-5 h-5" />
        </Button>
      </form>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Button variant="ghost" size="icon">
              <VideoIcon className="w-6 h-6" />
            </Button>
            <Button variant="ghost" size="icon">
              <Bell className="w-6 h-6" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                  />
                }
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.image} />
                  <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuItem onClick={() => void handleThemeChange()}>
                  {theme === "dark" ? (
                    <><Sun className="mr-2 h-4 w-4" /> Switch to light theme</>
                  ) : (
                    <><Moon className="mr-2 h-4 w-4" /> Switch to dark theme</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/security" />}>
                  Account security
                </DropdownMenuItem>
                {user?.channelname ? (
                  <DropdownMenuItem
                    render={<Link href={`/channel/${user?._id}`} />}
                  >
                    Your channel
                  </DropdownMenuItem>
                ) : (
                  <div className="px-2 py-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => setisdialogeopen(true)}
                    >
                      Create Channel
                    </Button>
                  </div>
                )}
                <DropdownMenuItem render={<Link href="/history" />}>
                  History
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/liked" />}>
                  Liked videos
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/watch-later" />}>
                  Watch later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <Button
              className="flex items-center gap-2"
              onClick={handlegooglesignin}
              disabled={isSigningIn}
            >
              <User className="w-4 h-4" />
              {isSigningIn ? "Signing in..." : "Sign in"}
            </Button>
            {authError && !pendingVerification && (
              <p role="alert" className="max-w-56 text-xs text-red-600">
                {authError}
              </p>
            )}
          </>
        )}{" "}
      </div>
      <Channeldialogue
        isopen={isdialogeopen}
        onclose={() => setisdialogeopen(false)}
        mode="create"
      />
      {pendingVerification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleVerifyLogin}
            className="w-full max-w-md space-y-4 rounded-xl bg-background p-6 text-foreground shadow-xl"
          >
            <h2 className="text-lg font-semibold">Verify this sign-in</h2>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to {pendingVerification.email}.
            </p>
            <Input
              aria-label="Email verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, ""))
              }
              required
            />
            {(securityError || authError) && (
              <p role="alert" className="text-sm text-red-600">
                {securityError || authError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void resendLoginCode()}
                disabled={isSigningIn}
              >
                Send new code
              </Button>
              <Button type="button" variant="ghost" onClick={logout}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSigningIn || verificationCode.length !== 6}>
                {isSigningIn ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
};

export default Header;