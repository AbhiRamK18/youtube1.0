"use client";
import { useRouter } from "next/navigation";
import React, { ChangeEvent, FormEvent, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { toast } from "sonner";

type ChannelData = {
  name?: string;
  description?: string;
};

const Channeldialogue = ({
  isopen,
  onclose,
  channeldata,
  mode,
}: {
  isopen: boolean;
  onclose: () => void;
  channeldata?: ChannelData | null;
  mode: "create" | "edit";
}) => {
  const { user, login } = useUser();
  // const user: any = {
  //   id: "1",
  //   name: "John Doe",
  //   email: "john@example.com",
  //   image: "https://github.com/shadcn.png?height=32&width=32",
  // };
  const router = useRouter();
  const [formData, setFormData] = useState(() => ({
    name: mode === "edit" ? channeldata?.name || "" : user?.name || "",
    description: mode === "edit" ? channeldata?.description || "" : "",
  }));
  const [isSubmitting, setisSubmitting] = useState(false);
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?._id) return;
    const payload = {
      channelname: formData.name,
      description: formData.description,
    };
    setisSubmitting(true);
    try {
      const response = await axiosInstance.patch(
        `/user/update/${user._id}`,
        payload
      );
      login(response.data);
      router.push(`/channel/${user._id}`);
      setFormData({
        name: "",
        description: "",
      });
      onclose();
    } catch (error) {
      console.error("Unable to save channel details:", error);
      toast.error("Unable to save your channel. Please try again.");
    } finally {
      setisSubmitting(false);
    }
  };
  return (
    <Dialog open={isopen} onOpenChange={onclose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create your channel" : "Edit your channel"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handlesubmit} className="space-y-6">
          {/* Channel Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Channel Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>
          {/* Channel Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Channel Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Tell viewers about your channel..."
            />
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={onclose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                ? "Create Channel"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Channeldialogue;