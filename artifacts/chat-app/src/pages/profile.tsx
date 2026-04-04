import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const { toast } = useToast();
  const updateProfileMutation = useUpdateProfile();

  const [name, setName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");

  const handleSave = () => {
    if (!user) return;
    updateProfileMutation.mutate(
      { userId: user.id, data: { name, avatarUrl } },
      {
        onSuccess: (updatedUser) => {
          updateUser(updatedUser);
          toast({
            title: "Profile updated",
            description: "Your profile has been saved successfully.",
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to update profile",
            description: err.message || "An error occurred.",
          });
        },
      }
    );
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary text-white p-4 shadow-sm flex items-center space-x-4 h-16">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-medium">Profile</h1>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 flex flex-col items-center border-b border-gray-100">
            <div className="relative group cursor-pointer mb-4">
              <Avatar className="h-32 w-32 border-4 border-white shadow-md">
                <AvatarImage src={avatarUrl || ""} alt={name} />
                <AvatarFallback className="text-4xl bg-primary/10 text-primary">
                  {name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Upload className="text-white h-8 w-8" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{user.name}</h2>
            <p className="text-gray-500">{user.email}</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-gray-500 ml-1">This is not your username or pin. This name will be visible to your contacts.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar">Avatar URL</Label>
                <Input 
                  id="avatar" 
                  value={avatarUrl} 
                  onChange={(e) => setAvatarUrl(e.target.value)} 
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <Button 
                variant="outline" 
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={logout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updateProfileMutation.isPending || (name === user.name && avatarUrl === (user.avatarUrl || ""))}
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
