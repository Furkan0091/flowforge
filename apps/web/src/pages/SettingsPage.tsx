import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { useToast } from "../components/ui/Toaster";

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const toast = useToast();

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.auth.updateProfile({ name });
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Failed to update profile", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error("Failed to change password", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
        <p className="text-xs text-zinc-500">Account profile and security</p>
      </div>

      <form onSubmit={saveProfile} className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Profile</h2>
        <div>
          <label className="label">Email</label>
          <input className="input" value={user?.email ?? ""} disabled />
        </div>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <button type="submit" disabled={savingProfile} className="btn-primary">
          {savingProfile ? "Saving…" : "Save profile"}
        </button>
      </form>

      <form onSubmit={changePassword} className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Change password</h2>
        <div>
          <label className="label" htmlFor="current">Current password</label>
          <input id="current" type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="new">New password</label>
          <input id="new" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={savingPassword} className="btn-secondary">
          {savingPassword ? "Updating…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
