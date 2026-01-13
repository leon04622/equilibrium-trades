import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PositionsPanelProps {
  connected: boolean;
}

export function PositionsPanel({ connected }: PositionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!connected) {
    return (
      <div className="border-t bg-background">
        <div 
          className="flex items-center justify-between px-4 py-2 cursor-pointer hover-elevate"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Positions</span>
            <Badge variant="secondary" className="text-xs">Not Connected</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
        
        {isExpanded && (
          <div className="px-4 pb-4">
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Connect your Hyperliquid wallet to view positions</p>
              <Button variant="outline" size="sm" className="mt-3" data-testid="button-connect-wallet">
                Connect Wallet
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t bg-background">
      <Tabs defaultValue="positions" className="w-full">
        <div className="flex items-center justify-between px-2 border-b">
          <TabsList className="bg-transparent h-10 p-0 gap-0">
            <TabsTrigger 
              value="positions" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-positions"
            >
              Positions
              <Badge variant="secondary" className="ml-2 text-xs h-5">0</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="orders"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-orders"
            >
              Open Orders
              <Badge variant="secondary" className="ml-2 text-xs h-5">0</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="twap"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-twap"
            >
              TWAP
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-history"
            >
              Trade History
            </TabsTrigger>
          </TabsList>
          
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>

        {isExpanded && (
          <ScrollArea className="h-32">
            <TabsContent value="positions" className="m-0 p-4">
              <div className="text-center text-sm text-muted-foreground py-4">
                No open positions
              </div>
            </TabsContent>
            <TabsContent value="orders" className="m-0 p-4">
              <div className="text-center text-sm text-muted-foreground py-4">
                No open orders
              </div>
            </TabsContent>
            <TabsContent value="twap" className="m-0 p-4">
              <div className="text-center text-sm text-muted-foreground py-4">
                No active TWAP orders
              </div>
            </TabsContent>
            <TabsContent value="history" className="m-0 p-4">
              <div className="text-center text-sm text-muted-foreground py-4">
                No trade history
              </div>
            </TabsContent>
          </ScrollArea>
        )}
      </Tabs>
    </div>
  );
}
