import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Wallet, Shield, CheckCircle2, Loader2, AlertCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { apiRequest } from "@/lib/queryClient";

const BUILDER_CODE = "EQUILIBRIUM_BUILDER";
const BUILDER_MESSAGE = `I authorize Equilibrium (${BUILDER_CODE}) to act as my builder on Hyperliquid. This approval allows Equilibrium to submit trading orders on my behalf. I understand that I remain in full control of my funds at all times.

Timestamp: ${new Date().toISOString().split('T')[0]}`;

type OnboardingStep = "idle" | "connecting" | "signing" | "registering" | "complete" | "error";

interface OnboardingFlowProps {
  onComplete?: () => void;
  compact?: boolean;
}

export function OnboardingFlow({ onComplete, compact = false }: OnboardingFlowProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { address, isConnected, isConnecting, connect, signer } = useWallet();
  const [step, setStep] = useState<OnboardingStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  useEffect(() => {
    if (address) {
      checkUserStatus(address);
    }
  }, [address]);

  const checkUserStatus = async (walletAddress: string) => {
    setIsCheckingStatus(true);
    try {
      const response = await fetch(`/api/wallet-user/${walletAddress}`);
      const data = await response.json();
      if (data.exists && data.builderCodeApproved) {
        setIsApproved(true);
        setStep("complete");
      }
    } catch (err) {
      console.error("Error checking user status:", err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const startOnboarding = async () => {
    setError(null);
    
    try {
      if (!isConnected) {
        setStep("connecting");
        await connect();
      } else if (signer) {
        signBuilderCode();
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      setStep("error");
      toast({
        title: "Connection Failed",
        description: err.message || "Failed to connect wallet. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (isConnected && signer && step === "connecting") {
      signBuilderCode();
    }
  }, [isConnected, signer, step]);

  const signBuilderCode = async () => {
    if (!signer || !address) {
      setError("Wallet not connected");
      setStep("error");
      return;
    }

    setStep("signing");
    
    try {
      const signature = await signer.signMessage(BUILDER_MESSAGE);
      
      setStep("registering");
      
      const response = await apiRequest("POST", "/api/wallet-user/approve-builder-code", {
        walletAddress: address,
        signature,
        message: BUILDER_MESSAGE,
      });

      const data = await response.json();
      
      if (data.success) {
        setIsApproved(true);
        setStep("complete");
        
        toast({
          title: "Account Created!",
          description: "Your Hyperliquid account is ready. Redirecting to trading...",
        });

        if (onComplete) {
          onComplete();
        } else {
          setTimeout(() => navigate("/trading"), 1500);
        }
      } else {
        throw new Error(data.error || "Failed to approve builder code");
      }
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected")) {
        setError("Signature rejected. Please approve the message to continue.");
        setStep("idle");
        toast({
          title: "Signature Rejected",
          description: "You need to sign the message to approve the builder code.",
          variant: "destructive",
        });
      } else {
        setError(err.message || "Failed to complete onboarding");
        setStep("error");
        toast({
          title: "Error",
          description: err.message || "Failed to complete onboarding",
          variant: "destructive",
        });
      }
    }
  };

  const getProgress = () => {
    switch (step) {
      case "connecting": return 33;
      case "signing": return 66;
      case "registering": return 90;
      case "complete": return 100;
      default: return 0;
    }
  };

  const getStepLabel = () => {
    switch (step) {
      case "connecting": return "Connecting wallet...";
      case "signing": return "Awaiting signature approval...";
      case "registering": return "Creating your account...";
      case "complete": return "Account ready!";
      default: return "";
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isApproved && step === "complete") {
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Account Ready</span>
        </div>
      );
    }
    
    return (
      <Alert className="border-success bg-success/10">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <AlertTitle className="text-success">Account Ready</AlertTitle>
        <AlertDescription>
          Your Hyperliquid account is connected and ready for trading.
        </AlertDescription>
      </Alert>
    );
  }

  if (compact) {
    return (
      <Button
        onClick={startOnboarding}
        disabled={step !== "idle" && step !== "error"}
        size="lg"
        className="gap-2"
        data-testid="button-create-account-compact"
      >
        {step !== "idle" && step !== "error" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {getStepLabel()}
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Create Hyperliquid Account
          </>
        )}
      </Button>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardTitle className="font-display flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          One-Click Hyperliquid Setup
        </CardTitle>
        <CardDescription>
          Connect your wallet and start trading in seconds
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {step !== "idle" && step !== "error" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{getStepLabel()}</span>
              <span className="text-muted-foreground">{getProgress()}%</span>
            </div>
            <Progress value={getProgress()} className="h-2" />
          </div>
        )}

        <div className="grid gap-4">
          <div className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
            step === "connecting" || isConnected 
              ? "bg-primary/10 border border-primary/20" 
              : "bg-muted/50"
          }`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isConnected ? "bg-success text-success-foreground" : "bg-primary/20"
            }`}>
              {step === "connecting" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : isConnected ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Wallet className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium">Connect Wallet</h4>
              <p className="text-sm text-muted-foreground">
                {isConnected 
                  ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}`
                  : "Connect MetaMask or Rabby wallet"
                }
              </p>
            </div>
          </div>

          <div className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
            step === "signing" || step === "registering" || step === "complete"
              ? "bg-primary/10 border border-primary/20" 
              : "bg-muted/50"
          }`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              step === "complete" ? "bg-success text-success-foreground" : "bg-primary/20"
            }`}>
              {step === "signing" || step === "registering" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : step === "complete" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Shield className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium">Approve Builder Code</h4>
              <p className="text-sm text-muted-foreground">
                {step === "complete" 
                  ? "Builder code approved"
                  : "Sign to authorize Equilibrium trading"
                }
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Non-Custodial & Secure</AlertTitle>
          <AlertDescription className="text-xs">
            Your private keys never leave your wallet. We only request signatures to authorize trading actions. 
            You remain in full control of your funds at all times.
          </AlertDescription>
        </Alert>

        <Button
          onClick={startOnboarding}
          disabled={step !== "idle" && step !== "error"}
          size="lg"
          className="w-full gap-2"
          data-testid="button-create-account"
        >
          {step !== "idle" && step !== "error" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {getStepLabel()}
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Create Hyperliquid Account
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
