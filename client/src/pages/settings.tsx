import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Moon, Sun, Bell, Shield, Palette, Monitor, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

interface NotificationSettings {
  patternAlerts: boolean;
  smaAlerts: boolean;
  tradeAlerts: boolean;
  eduAlerts: boolean;
}

interface SecuritySettings {
  sessionTimeout: string;
}

const NOTIFICATION_STORAGE_KEY = "equilibrium_notifications";
const SECURITY_STORAGE_KEY = "equilibrium_security";

function loadNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load notification settings:", e);
  }
  return {
    patternAlerts: true,
    smaAlerts: true,
    tradeAlerts: true,
    eduAlerts: false,
  };
}

function loadSecuritySettings(): SecuritySettings {
  try {
    const stored = localStorage.getItem(SECURITY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load security settings:", e);
  }
  return {
    sessionTimeout: "30",
  };
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { address } = useWallet();
  
  const [notifications, setNotifications] = useState<NotificationSettings>(loadNotificationSettings);
  const [security, setSecurity] = useState<SecuritySettings>(loadSecuritySettings);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      console.error("Failed to save notification settings:", e);
    }
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(security));
    } catch (e) {
      console.error("Failed to save security settings:", e);
    }
  }, [security]);

  const handleNotificationChange = (key: keyof NotificationSettings, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
    toast({
      title: "Settings updated",
      description: `${key.replace(/([A-Z])/g, ' $1').trim()} ${value ? 'enabled' : 'disabled'}`,
    });
  };

  const handleClearProgress = () => {
    if (address) {
      // Use the same key format as learn.tsx
      const key = `equilibrium_learning_progress_${address.toLowerCase()}`;
      localStorage.removeItem(key);
      toast({
        title: "Progress cleared",
        description: "Your learning progress has been reset.",
      });
    } else {
      toast({
        title: "No wallet connected",
        description: "Please connect your wallet to reset progress.",
        variant: "destructive",
      });
    }
  };

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
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Bright theme for well-lit environments</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Easier on the eyes in low-light conditions</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming soon - follows your device settings</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>These settings control in-app notifications. Browser notifications require additional permission.</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>
            Configure how you receive alerts and updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>Pattern Detection Alerts</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Get notified when our AI identifies trading patterns like bull flags or head & shoulders</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Get notified when AI detects new patterns
              </p>
            </div>
            <Switch 
              checked={notifications.patternAlerts}
              onCheckedChange={(checked) => handleNotificationChange('patternAlerts', checked)}
              data-testid="switch-pattern-alerts" 
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>SMA Crossover Alerts</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The core strategy: alerts when the 21-period SMA crosses above or below the 200-period SMA</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Alerts when 21/200 SMA crossovers occur
              </p>
            </div>
            <Switch 
              checked={notifications.smaAlerts}
              onCheckedChange={(checked) => handleNotificationChange('smaAlerts', checked)}
              data-testid="switch-sma-alerts" 
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>Trade Recommendations</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Educational suggestions for entry points, stop losses, and take profit targets</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Entry, stop loss, and take profit suggestions
              </p>
            </div>
            <Switch 
              checked={notifications.tradeAlerts}
              onCheckedChange={(checked) => handleNotificationChange('tradeAlerts', checked)}
              data-testid="switch-trade-alerts" 
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>Educational Tips</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Occasional tips to help improve your trading knowledge and discipline</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Periodic trading tips and insights
              </p>
            </div>
            <Switch 
              checked={notifications.eduAlerts}
              onCheckedChange={(checked) => handleNotificationChange('eduAlerts', checked)}
              data-testid="switch-edu-alerts" 
            />
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
              <div className="flex items-center gap-2">
                <Label>Two-Factor Authentication</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your wallet already provides strong security through cryptographic signatures</p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-2">
                <Label>Session Timeout</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Automatically disconnect your wallet after a period of inactivity</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-logout after inactivity
              </p>
            </div>
            <select 
              className="rounded-md border px-3 py-1.5 text-sm bg-background" 
              data-testid="select-timeout"
              value={security.sessionTimeout}
              onChange={(e) => setSecurity(prev => ({ ...prev, sessionTimeout: e.target.value }))}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="never">Never</option>
            </select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>API Key Management</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This platform is non-custodial - no API keys needed. All trades are signed by your wallet.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-2">
                <Label>Clear Learning Progress</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This will reset all your completed lessons. You'll need to start the educational modules from the beginning.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Reset all your completed lessons and achievements
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearProgress}
              data-testid="button-clear-progress"
            >
              Reset
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label>Delete Account</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Since this is a non-custodial platform, you can simply disconnect your wallet. Your on-chain data remains yours.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
