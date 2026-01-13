import { cn } from "@/lib/utils";

interface PatternDiagramProps {
  patternId: string;
  className?: string;
}

export function PatternDiagram({ patternId, className }: PatternDiagramProps) {
  const bullColor = "currentColor";
  const bearColor = "currentColor";
  const lineColor = "currentColor";
  
  const renderPattern = () => {
    switch (patternId) {
      case "bull-flag":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,90 L50,20 L55,30 L60,25 L65,35 L70,30 L75,40 L80,35 L85,45 L90,40 L95,50 L100,45 L105,55 L110,50 L115,60 L130,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M50,20 L130,20" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="140" y="25" fill="currentColor" fontSize="10">Breakout</text>
            <text x="20" y="80" fill="currentColor" fontSize="8" opacity="0.6">Pole</text>
            <text x="80" y="60" fill="currentColor" fontSize="8" opacity="0.6">Flag</text>
          </svg>
        );
      case "bear-flag":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <path d="M10,10 L50,80 L55,70 L60,75 L65,65 L70,70 L75,60 L80,65 L85,55 L90,60 L95,50 L100,55 L105,45 L110,50 L115,40 L130,80" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M50,80 L130,80" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="140" y="85" fill="currentColor" fontSize="10">Breakdown</text>
          </svg>
        );
      case "ascending-triangle":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <line x1="20" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="2" opacity="0.5"/>
            <path d="M20,80 L60,50 L100,30 L140,25 L180,20" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M20,80 L180,20" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="100" y="15" fill="currentColor" fontSize="8" opacity="0.6">Resistance</text>
          </svg>
        );
      case "descending-triangle":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <line x1="20" y1="80" x2="180" y2="80" stroke="currentColor" strokeWidth="2" opacity="0.5"/>
            <path d="M20,20 L60,50 L100,70 L140,75 L180,80" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M20,20 L180,80" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="100" y="92" fill="currentColor" fontSize="8" opacity="0.6">Support</text>
          </svg>
        );
      case "symmetrical-triangle":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-primary">
            <path d="M20,20 L180,50" stroke="currentColor" strokeWidth="2" opacity="0.5"/>
            <path d="M20,80 L180,50" stroke="currentColor" strokeWidth="2" opacity="0.5"/>
            <path d="M30,25 L50,70 L80,35 L100,60 L130,42 L150,55 L170,50" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <text x="155" y="45" fill="currentColor" fontSize="8" opacity="0.6">Apex</text>
          </svg>
        );
      case "pennant":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,90 L40,20" stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="40" y1="20" x2="120" y2="45" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <line x1="40" y1="40" x2="120" y2="45" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <path d="M120,45 L160,10" stroke="currentColor" strokeWidth="2" strokeDasharray="4" fill="none"/>
            <text x="20" y="60" fill="currentColor" fontSize="8" opacity="0.6">Pole</text>
            <text x="70" y="38" fill="currentColor" fontSize="8" opacity="0.6">Pennant</text>
          </svg>
        );
      case "cup-and-handle":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,20 Q50,90 100,20 L120,35 L140,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="10" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <text x="50" y="60" fill="currentColor" fontSize="8" opacity="0.6">Cup</text>
            <text x="115" y="45" fill="currentColor" fontSize="7" opacity="0.6">Handle</text>
          </svg>
        );
      case "head-and-shoulders":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <path d="M10,70 L30,50 L50,70 L70,30 L90,10 L110,30 L130,70 L150,50 L170,70 L190,80" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="30" y1="70" x2="170" y2="70" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <text x="85" y="8" fill="currentColor" fontSize="8" opacity="0.6">Head</text>
            <text x="25" y="48" fill="currentColor" fontSize="7" opacity="0.6">LS</text>
            <text x="145" y="48" fill="currentColor" fontSize="7" opacity="0.6">RS</text>
          </svg>
        );
      case "inverse-head-and-shoulders":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,30 L30,50 L50,30 L70,70 L90,90 L110,70 L130,30 L150,50 L170,30 L190,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="30" y1="30" x2="170" y2="30" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <text x="85" y="95" fill="currentColor" fontSize="8" opacity="0.6">Head</text>
          </svg>
        );
      case "double-top":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <path d="M10,80 L40,20 L80,60 L120,20 L160,80" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="40" y1="20" x2="120" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <line x1="80" y1="60" x2="180" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="75" y="15" fill="currentColor" fontSize="8" opacity="0.6">Resistance</text>
          </svg>
        );
      case "double-bottom":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,20 L40,80 L80,40 L120,80 L160,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="40" y1="80" x2="120" y2="80" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <line x1="80" y1="40" x2="180" y2="40" stroke="currentColor" strokeWidth="1" strokeDasharray="4"/>
            <text x="75" y="90" fill="currentColor" fontSize="8" opacity="0.6">Support</text>
          </svg>
        );
      case "triple-top":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <path d="M10,80 L30,20 L55,60 L80,20 L105,60 L130,20 L160,80" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="30" y1="20" x2="130" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
          </svg>
        );
      case "triple-bottom":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,20 L30,80 L55,40 L80,80 L105,40 L130,80 L160,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="30" y1="80" x2="130" y2="80" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
          </svg>
        );
      case "diamond":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-warning">
            <path d="M20,50 L60,20 L100,10 L140,20 L180,50 L140,80 L100,90 L60,80 Z" 
                  stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5"/>
            <path d="M20,50 L50,35 L80,55 L100,25 L130,60 L160,40 L180,50" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        );
      case "wedge-rising":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bearish">
            <line x1="20" y1="80" x2="160" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <line x1="20" y1="90" x2="160" y2="50" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <path d="M25,85 L50,60 L80,75 L110,45 L140,55 L155,40" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <text x="160" y="65" fill="currentColor" fontSize="8">Break</text>
          </svg>
        );
      case "wedge-falling":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <line x1="20" y1="20" x2="160" y2="70" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <line x1="20" y1="10" x2="160" y2="50" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <path d="M25,15 L50,40 L80,25 L110,55 L140,45 L155,60" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <text x="160" y="35" fill="currentColor" fontSize="8">Break</text>
          </svg>
        );
      case "rounding-bottom":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-bullish">
            <path d="M10,20 Q30,20 40,40 Q50,60 70,75 Q90,85 100,85 Q110,85 130,75 Q150,60 160,40 Q170,20 190,20" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="10" y1="20" x2="190" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
          </svg>
        );
      case "engulfing-bullish":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <rect x="60" y="30" width="20" height="40" className="fill-bearish stroke-bearish"/>
            <line x1="70" y1="20" x2="70" y2="30" className="stroke-bearish" strokeWidth="2"/>
            <line x1="70" y1="70" x2="70" y2="80" className="stroke-bearish" strokeWidth="2"/>
            <rect x="100" y="20" width="30" height="60" className="fill-bullish stroke-bullish"/>
            <line x1="115" y1="10" x2="115" y2="20" className="stroke-bullish" strokeWidth="2"/>
            <line x1="115" y1="80" x2="115" y2="90" className="stroke-bullish" strokeWidth="2"/>
          </svg>
        );
      case "engulfing-bearish":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <rect x="60" y="30" width="20" height="40" className="fill-bullish stroke-bullish"/>
            <line x1="70" y1="20" x2="70" y2="30" className="stroke-bullish" strokeWidth="2"/>
            <line x1="70" y1="70" x2="70" y2="80" className="stroke-bullish" strokeWidth="2"/>
            <rect x="100" y="20" width="30" height="60" className="fill-bearish stroke-bearish"/>
            <line x1="115" y1="10" x2="115" y2="20" className="stroke-bearish" strokeWidth="2"/>
            <line x1="115" y1="80" x2="115" y2="90" className="stroke-bearish" strokeWidth="2"/>
          </svg>
        );
      case "morning-star":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <rect x="30" y="20" width="25" height="50" className="fill-bearish stroke-bearish"/>
            <line x1="42" y1="10" x2="42" y2="20" className="stroke-bearish" strokeWidth="2"/>
            <line x1="42" y1="70" x2="42" y2="80" className="stroke-bearish" strokeWidth="2"/>
            <rect x="85" y="55" width="15" height="15" className="fill-muted-foreground stroke-muted-foreground"/>
            <line x1="92" y1="50" x2="92" y2="55" className="stroke-muted-foreground" strokeWidth="2"/>
            <line x1="92" y1="70" x2="92" y2="75" className="stroke-muted-foreground" strokeWidth="2"/>
            <rect x="130" y="30" width="25" height="40" className="fill-bullish stroke-bullish"/>
            <line x1="142" y1="20" x2="142" y2="30" className="stroke-bullish" strokeWidth="2"/>
            <line x1="142" y1="70" x2="142" y2="80" className="stroke-bullish" strokeWidth="2"/>
          </svg>
        );
      case "evening-star":
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <rect x="30" y="30" width="25" height="50" className="fill-bullish stroke-bullish"/>
            <line x1="42" y1="20" x2="42" y2="30" className="stroke-bullish" strokeWidth="2"/>
            <line x1="42" y1="80" x2="42" y2="90" className="stroke-bullish" strokeWidth="2"/>
            <rect x="85" y="20" width="15" height="15" className="fill-muted-foreground stroke-muted-foreground"/>
            <line x1="92" y1="15" x2="92" y2="20" className="stroke-muted-foreground" strokeWidth="2"/>
            <line x1="92" y1="35" x2="92" y2="40" className="stroke-muted-foreground" strokeWidth="2"/>
            <rect x="130" y="30" width="25" height="40" className="fill-bearish stroke-bearish"/>
            <line x1="142" y1="20" x2="142" y2="30" className="stroke-bearish" strokeWidth="2"/>
            <line x1="142" y1="70" x2="142" y2="80" className="stroke-bearish" strokeWidth="2"/>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 200 100" className="w-full h-full text-muted-foreground">
            <path d="M10,80 L40,60 L70,70 L100,40 L130,50 L160,30 L190,35" 
                  stroke="currentColor" strokeWidth="2" fill="none"/>
            <circle cx="100" cy="50" r="20" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3"/>
          </svg>
        );
    }
  };

  return (
    <div className={cn("bg-muted/30 rounded-lg p-4", className)}>
      {renderPattern()}
    </div>
  );
}
