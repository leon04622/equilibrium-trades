import { Settings as SettingsIcon, Moon, Sun, Bell, Shield, Palette, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Customize your Equilibrium experience
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize how Equilibrium looks on your device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Theme</Label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                  theme === "light" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover-elevate"
                )}
                data-testid="theme-light"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border shadow-sm">
                  <Sun className="h-5 w-5 text-amber-500" />
                </div>
                <span className="text-sm font-medium">Light</span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                  theme === "dark" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover-elevate"
                )}
                data-testid="theme-dark"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 border border-slate-700">
                  <Moon className="h-5 w-5 text-slate-300" />
                </div>
                <span className="text-sm font-medium">Dark</span>
              </button>
              <button
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border opacity-50 cursor-not-allowed"
                )}
                disabled
                data-testid="theme-system"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-white to-slate-900 border">
                  <Monitor className="h-5 w-5 text-slate-500" />
                </div>
                <span className="text-sm font-medium">System</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure how you receive alerts and updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pattern Detection Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when AI detects new patterns
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-pattern-alerts" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>SMA Crossover Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Alerts when 21/200 SMA crossovers occur
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-sma-alerts" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Trade Recommendations</Label>
              <p className="text-sm text-muted-foreground">
                Entry, stop loss, and take profit suggestions
              </p>
            </div>
            <Switch defaultChecked data-testid="switch-trade-alerts" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Educational Tips</Label>
              <p className="text-sm text-muted-foreground">
                Periodic trading tips and insights
              </p>
            </div>
            <Switch data-testid="switch-edu-alerts" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your account security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Two-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security
              </p>
            </div>
            <Button variant="outline" size="sm" data-testid="button-2fa">
              Enable
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Session Timeout</Label>
              <p className="text-sm text-muted-foreground">
                Auto-logout after inactivity
              </p>
            </div>
            <select className="rounded-md border px-3 py-1.5 text-sm bg-background" data-testid="select-timeout">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="never">Never</option>
            </select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>API Key Management</Label>
              <p className="text-sm text-muted-foreground">
                Manage your Hyperliquid API credentials
              </p>
            </div>
            <Button variant="outline" size="sm" data-testid="button-manage-api">
              Manage
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Clear Learning Progress</Label>
              <p className="text-sm text-muted-foreground">
                Reset all your completed lessons and achievements
              </p>
            </div>
            <Button variant="outline" size="sm" data-testid="button-clear-progress">
              Reset
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Delete Account</Label>
              <p className="text-sm text-muted-foreground">
                Permanently delete your Equilibrium account
              </p>
            </div>
            <Button variant="destructive" size="sm" data-testid="button-delete-account">
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
