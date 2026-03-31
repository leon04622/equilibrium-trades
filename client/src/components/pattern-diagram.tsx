import { cn } from "@/lib/utils";

interface PatternDiagramProps {
  patternId: string;
  className?: string;
}

function Candle({ x, open, high, low, close, width = 12 }: { x: number; open: number; high: number; low: number; close: number; width?: number }) {
  const isBullish = close < open; // In SVG, lower Y is higher price
  const bodyTop = Math.min(open, close);
  const bodyHeight = Math.max(Math.abs(close - open), 2);
  const wickX = x + width / 2;
  
  return (
    <g>
      <line 
        x1={wickX} 
        y1={high} 
        x2={wickX} 
        y2={low} 
        className={isBullish ? "stroke-bullish" : "stroke-bearish"} 
        strokeWidth="1.5"
      />
      <rect 
        x={x} 
        y={bodyTop} 
        width={width} 
        height={bodyHeight} 
        className={isBullish ? "fill-bullish stroke-bullish" : "fill-bearish stroke-bearish"}
        strokeWidth="1"
      />
    </g>
  );
}

export function PatternDiagram({ patternId, className }: PatternDiagramProps) {
  const renderPattern = () => {
    switch (patternId) {
      case "bull-flag":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <line x1="22" y1="84" x2="22" y2="16" className="stroke-bullish" strokeWidth="4" strokeLinecap="round" />
            <polygon points="22,10 16,22 28,22" className="fill-bullish" />
            <line x1="54" y1="32" x2="150" y2="42" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4" />
            <line x1="60" y1="50" x2="156" y2="60" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4" />
            <Candle x={44} open={40} high={34} low={48} close={36} width={10} />
            <Candle x={60} open={44} high={40} low={52} close={48} width={10} />
            <Candle x={76} open={49} high={45} low={56} close={53} width={10} />
            <Candle x={92} open={53} high={48} low={58} close={55} width={10} />
            <Candle x={108} open={56} high={50} low={60} close={52} width={10} />
            <Candle x={124} open={52} high={46} low={58} close={49} width={10} />
            <line x1="160" y1="46" x2="188" y2="22" className="stroke-bullish" strokeWidth="3" strokeLinecap="round" />
            <polygon points="192,18 180,20 188,28" className="fill-bullish" />
            <text x="14" y="94" className="fill-muted-foreground text-[8px]">Pole up</text>
            <text x="90" y="72" className="fill-muted-foreground text-[8px]">Pullback channel</text>
            <text x="160" y="18" className="fill-bullish text-[8px]">Breakout</text>
          </svg>
        );
      case "bear-flag":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <line x1="24" y1="16" x2="24" y2="84" className="stroke-bearish" strokeWidth="4" strokeLinecap="round" />
            <polygon points="24,90 18,78 30,78" className="fill-bearish" />
            <line x1="56" y1="62" x2="152" y2="50" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4" />
            <line x1="62" y1="46" x2="158" y2="34" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4" />
            <Candle x={46} open={58} high={54} low={68} close={64} width={10} />
            <Candle x={62} open={54} high={48} low={62} close={50} width={10} />
            <Candle x={78} open={50} high={44} low={58} close={46} width={10} />
            <Candle x={94} open={46} high={40} low={54} close={42} width={10} />
            <Candle x={110} open={42} high={38} low={50} close={47} width={10} />
            <Candle x={126} open={46} high={42} low={55} close={52} width={10} />
            <line x1="162" y1="54" x2="190" y2="80" className="stroke-bearish" strokeWidth="3" strokeLinecap="round" />
            <polygon points="194,84 182,82 188,74" className="fill-bearish" />
            <text x="12" y="12" className="fill-muted-foreground text-[8px]">Pole down</text>
            <text x="88" y="26" className="fill-muted-foreground text-[8px]">Bounce channel</text>
            <text x="158" y="90" className="fill-bearish text-[8px]">Breakdown</text>
          </svg>
        );
      case "ascending-triangle":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={80} high={75} low={85} close={70} />
            <Candle x={25} open={70} high={25} low={75} close={30} />
            <Candle x={40} open={35} high={30} low={60} close={55} />
            <Candle x={55} open={55} high={25} low={60} close={30} />
            <Candle x={70} open={35} high={28} low={50} close={45} />
            <Candle x={85} open={45} high={25} low={50} close={30} />
            <Candle x={100} open={32} high={25} low={42} close={38} />
            <Candle x={115} open={38} high={25} low={45} close={30} />
            <Candle x={130} open={32} high={25} low={38} close={28} />
            <Candle x={145} open={28} high={20} low={32} close={22} />
            <Candle x={160} open={22} high={15} low={28} close={18} />
            <line x1="25" y1="25" x2="175" y2="25" className="stroke-bullish" strokeWidth="2" opacity="0.7"/>
            <line x1="10" y1="85" x2="160" y2="35" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="180" y="28" className="fill-muted-foreground text-[7px]">Resistance</text>
          </svg>
        );
      case "descending-triangle":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={20} high={15} low={25} close={30} />
            <Candle x={25} open={30} high={25} low={75} close={70} />
            <Candle x={40} open={65} high={40} low={70} close={45} />
            <Candle x={55} open={45} high={40} low={75} close={70} />
            <Candle x={70} open={65} high={50} low={72} close={55} />
            <Candle x={85} open={55} high={50} low={75} close={70} />
            <Candle x={100} open={68} high={58} low={75} close={62} />
            <Candle x={115} open={62} high={55} low={75} close={70} />
            <Candle x={130} open={68} high={62} low={75} close={72} />
            <Candle x={145} open={72} high={70} low={78} close={78} />
            <Candle x={160} open={78} high={75} low={88} close={85} />
            <line x1="25" y1="75" x2="175" y2="75" className="stroke-bearish" strokeWidth="2" opacity="0.7"/>
            <line x1="10" y1="15" x2="160" y2="65" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="180" y="78" className="fill-muted-foreground text-[7px]">Support</text>
          </svg>
        );
      case "symmetrical-triangle":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={15} high={10} low={22} close={20} />
            <Candle x={25} open={20} high={18} low={80} close={78} />
            <Candle x={40} open={75} high={20} low={80} close={25} />
            <Candle x={55} open={28} high={25} low={70} close={68} />
            <Candle x={70} open={65} high={30} low={70} close={35} />
            <Candle x={85} open={38} high={35} low={62} close={58} />
            <Candle x={100} open={55} high={38} low={60} close={42} />
            <Candle x={115} open={45} high={42} low={55} close={52} />
            <Candle x={130} open={50} high={45} low={54} close={48} />
            <Candle x={145} open={48} high={40} low={52} close={42} />
            <Candle x={160} open={42} high={35} low={46} close={38} />
            <line x1="25" y1="10" x2="175" y2="45" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <line x1="25" y1="85" x2="175" y2="55" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="175" y="52" className="fill-muted-foreground text-[7px]">Apex</text>
          </svg>
        );
      case "pennant":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={90} high={85} low={92} close={78} />
            <Candle x={18} open={78} high={70} low={82} close={58} />
            <Candle x={31} open={58} high={48} low={62} close={38} />
            <Candle x={44} open={38} high={28} low={42} close={25} />
            <Candle x={57} open={30} high={25} low={38} close={35} />
            <Candle x={70} open={38} high={32} low={45} close={40} />
            <Candle x={83} open={38} high={30} low={42} close={32} />
            <Candle x={96} open={34} high={30} low={40} close={36} />
            <Candle x={109} open={35} high={32} low={38} close={33} />
            <Candle x={122} open={32} high={28} low={36} close={30} />
            <Candle x={135} open={28} high={18} low={32} close={15} />
            <Candle x={148} open={15} high={8} low={18} close={10} />
            <line x1="44" y1="25" x2="135" y2="32" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="3"/>
            <line x1="57" y1="40" x2="135" y2="32" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="3"/>
            <text x="15" y="72" className="fill-muted-foreground text-[8px]">Pole</text>
            <text x="85" y="50" className="fill-muted-foreground text-[7px]">Pennant</text>
          </svg>
        );
      case "cup-and-handle":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={25} high={20} low={30} close={28} />
            <Candle x={18} open={28} high={25} low={40} close={38} />
            <Candle x={31} open={38} high={35} low={55} close={52} />
            <Candle x={44} open={52} high={50} low={68} close={65} />
            <Candle x={57} open={65} high={62} low={75} close={72} />
            <Candle x={70} open={72} high={70} low={78} close={75} />
            <Candle x={83} open={75} high={72} low={80} close={70} />
            <Candle x={96} open={70} high={65} low={75} close={55} />
            <Candle x={109} open={55} high={48} low={60} close={42} />
            <Candle x={122} open={42} high={35} low={48} close={30} />
            <Candle x={135} open={32} high={28} low={45} close={42} />
            <Candle x={148} open={40} high={35} low={48} close={32} />
            <Candle x={161} open={32} high={25} low={38} close={22} />
            <Candle x={174} open={22} high={15} low={28} close={18} />
            <line x1="5" y1="22" x2="195" y2="22" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
            <text x="60" y="85" className="fill-muted-foreground text-[8px]">Cup</text>
            <text x="145" y="55" className="fill-muted-foreground text-[7px]">Handle</text>
          </svg>
        );
      case "head-and-shoulders":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={72} high={68} low={78} close={65} />
            <Candle x={18} open={65} high={55} low={70} close={50} />
            <Candle x={31} open={50} high={42} low={55} close={55} />
            <Candle x={44} open={55} high={50} low={65} close={62} />
            <Candle x={57} open={62} high={40} low={68} close={35} />
            <Candle x={70} open={35} high={25} low={40} close={20} />
            <Candle x={83} open={20} high={12} low={25} close={15} />
            <Candle x={96} open={18} high={15} low={38} close={35} />
            <Candle x={109} open={35} high={30} low={65} close={62} />
            <Candle x={122} open={62} high={40} low={68} close={45} />
            <Candle x={135} open={48} high={42} low={65} close={62} />
            <Candle x={148} open={62} high={58} low={68} close={68} />
            <Candle x={161} open={68} high={65} low={78} close={75} />
            <Candle x={174} open={75} high={72} low={85} close={82} />
            <line x1="31" y1="62" x2="148" y2="68" className="stroke-primary" strokeWidth="1.5" strokeDasharray="4"/>
            <text x="85" y="8" className="fill-muted-foreground text-[8px]">Head</text>
            <text x="28" y="38" className="fill-muted-foreground text-[7px]">LS</text>
            <text x="120" y="38" className="fill-muted-foreground text-[7px]">RS</text>
            <text x="78" y="78" className="fill-muted-foreground text-[7px]">Neckline</text>
          </svg>
        );
      case "inverse-head-and-shoulders":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={28} high={22} low={32} close={35} />
            <Candle x={18} open={35} high={30} low={45} close={50} />
            <Candle x={31} open={50} high={45} low={58} close={45} />
            <Candle x={44} open={45} high={38} low={50} close={38} />
            <Candle x={57} open={38} high={35} low={60} close={65} />
            <Candle x={70} open={65} high={62} low={78} close={80} />
            <Candle x={83} open={80} high={78} low={88} close={88} />
            <Candle x={96} open={85} high={80} low={88} close={65} />
            <Candle x={109} open={65} high={58} low={68} close={38} />
            <Candle x={122} open={38} high={35} low={60} close={55} />
            <Candle x={135} open={52} high={45} low={58} close={38} />
            <Candle x={148} open={38} high={32} low={42} close={32} />
            <Candle x={161} open={32} high={25} low={38} close={25} />
            <Candle x={174} open={25} high={18} low={30} close={18} />
            <line x1="31" y1="38" x2="148" y2="32" className="stroke-primary" strokeWidth="1.5" strokeDasharray="4"/>
            <text x="85" y="95" className="fill-muted-foreground text-[8px]">Head</text>
          </svg>
        );
      case "double-top":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={80} high={75} low={85} close={70} />
            <Candle x={25} open={70} high={60} low={75} close={50} />
            <Candle x={40} open={50} high={38} low={55} close={28} />
            <Candle x={55} open={28} high={20} low={32} close={22} />
            <Candle x={70} open={25} high={20} low={45} close={42} />
            <Candle x={85} open={45} high={40} low={60} close={58} />
            <Candle x={100} open={60} high={55} low={65} close={52} />
            <Candle x={115} open={52} high={38} low={58} close={30} />
            <Candle x={130} open={30} high={22} low={35} close={25} />
            <Candle x={145} open={28} high={25} low={48} close={45} />
            <Candle x={160} open={48} high={45} low={70} close={68} />
            <Candle x={175} open={70} high={68} low={85} close={82} />
            <line x1="40" y1="20" x2="130" y2="20" className="stroke-bearish" strokeWidth="2" opacity="0.7"/>
            <line x1="55" y1="58" x2="190" y2="58" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="75" y="15" className="fill-muted-foreground text-[8px]">Double Top</text>
          </svg>
        );
      case "double-bottom":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={20} high={15} low={25} close={30} />
            <Candle x={25} open={30} high={25} low={40} close={50} />
            <Candle x={40} open={50} high={45} low={62} close={72} />
            <Candle x={55} open={72} high={70} low={80} close={78} />
            <Candle x={70} open={75} high={70} low={80} close={58} />
            <Candle x={85} open={55} high={50} low={60} close={42} />
            <Candle x={100} open={40} high={35} low={48} close={48} />
            <Candle x={115} open={48} high={45} low={62} close={70} />
            <Candle x={130} open={70} high={68} low={78} close={75} />
            <Candle x={145} open={72} high={68} low={78} close={55} />
            <Candle x={160} open={52} high={45} low={58} close={32} />
            <Candle x={175} open={30} high={22} low={35} close={18} />
            <line x1="40" y1="80" x2="130" y2="80" className="stroke-bullish" strokeWidth="2" opacity="0.7"/>
            <line x1="55" y1="42" x2="190" y2="42" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="70" y="92" className="fill-muted-foreground text-[8px]">Double Bottom</text>
          </svg>
        );
      case "triple-top":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={75} high={70} low={80} close={60} />
            <Candle x={18} open={60} high={50} low={65} close={35} />
            <Candle x={31} open={35} high={22} low={40} close={25} />
            <Candle x={44} open={28} high={25} low={50} close={48} />
            <Candle x={57} open={50} high={48} low={55} close={40} />
            <Candle x={70} open={40} high={22} low={45} close={25} />
            <Candle x={83} open={28} high={25} low={52} close={50} />
            <Candle x={96} open={52} high={50} low={58} close={45} />
            <Candle x={109} open={45} high={22} low={50} close={25} />
            <Candle x={122} open={28} high={25} low={55} close={52} />
            <Candle x={135} open={55} high={52} low={62} close={58} />
            <Candle x={148} open={60} high={58} low={72} close={70} />
            <Candle x={161} open={72} high={70} low={85} close={82} />
            <line x1="18" y1="22" x2="122" y2="22" className="stroke-bearish" strokeWidth="2" opacity="0.7"/>
          </svg>
        );
      case "triple-bottom":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={25} high={20} low={30} close={40} />
            <Candle x={18} open={40} high={35} low={50} close={65} />
            <Candle x={31} open={65} high={62} low={78} close={75} />
            <Candle x={44} open={72} high={68} low={78} close={52} />
            <Candle x={57} open={50} high={45} low={55} close={60} />
            <Candle x={70} open={60} high={58} low={78} close={75} />
            <Candle x={83} open={72} high={68} low={78} close={48} />
            <Candle x={96} open={48} high={42} low={52} close={55} />
            <Candle x={109} open={55} high={52} low={78} close={75} />
            <Candle x={122} open={72} high={68} low={78} close={48} />
            <Candle x={135} open={45} high={40} low={50} close={38} />
            <Candle x={148} open={35} high={28} low={40} close={22} />
            <Candle x={161} open={22} high={15} low={28} close={18} />
            <line x1="18" y1="78" x2="122" y2="78" className="stroke-bullish" strokeWidth="2" opacity="0.7"/>
          </svg>
        );
      case "diamond":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={50} high={45} low={55} close={42} />
            <Candle x={23} open={42} high={30} low={48} close={28} />
            <Candle x={36} open={30} high={20} low={55} close={58} />
            <Candle x={49} open={60} high={15} low={65} close={18} />
            <Candle x={62} open={20} high={12} low={70} close={72} />
            <Candle x={75} open={75} high={10} low={80} close={15} />
            <Candle x={88} open={18} high={15} low={78} close={75} />
            <Candle x={101} open={72} high={20} low={78} close={22} />
            <Candle x={114} open={25} high={22} low={68} close={65} />
            <Candle x={127} open={62} high={35} low={68} close={38} />
            <Candle x={140} open={40} high={38} low={60} close={58} />
            <Candle x={153} open={55} high={48} low={60} close={52} />
            <Candle x={166} open={50} high={45} low={55} close={48} />
            <path d="M23,50 L75,10 L127,50 L75,85 Z" className="stroke-warning" strokeWidth="1" fill="none" opacity="0.5"/>
          </svg>
        );
      case "wedge-rising":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={85} high={80} low={90} close={75} />
            <Candle x={25} open={75} high={65} low={80} close={60} />
            <Candle x={40} open={60} high={52} low={70} close={68} />
            <Candle x={55} open={65} high={50} low={70} close={48} />
            <Candle x={70} open={48} high={40} low={58} close={55} />
            <Candle x={85} open={52} high={38} low={58} close={42} />
            <Candle x={100} open={42} high={35} low={52} close={48} />
            <Candle x={115} open={45} high={32} low={50} close={38} />
            <Candle x={130} open={38} high={30} low={48} close={45} />
            <Candle x={145} open={42} high={28} low={48} close={35} />
            <Candle x={160} open={38} high={35} low={60} close={58} />
            <Candle x={175} open={60} high={58} low={78} close={75} />
            <line x1="10" y1="80" x2="160" y2="28" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <line x1="10" y1="90" x2="160" y2="50" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="165" y="68" className="fill-bearish text-[8px]">Break</text>
          </svg>
        );
      case "wedge-falling":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={10} open={15} high={10} low={20} close={25} />
            <Candle x={25} open={25} high={20} low={35} close={40} />
            <Candle x={40} open={40} high={35} low={48} close={32} />
            <Candle x={55} open={35} high={30} low={52} close={52} />
            <Candle x={70} open={52} high={48} low={60} close={45} />
            <Candle x={85} open={48} high={42} low={62} close={58} />
            <Candle x={100} open={55} high={50} low={65} close={52} />
            <Candle x={115} open={55} high={50} low={68} close={62} />
            <Candle x={130} open={58} high={55} low={68} close={55} />
            <Candle x={145} open={58} high={52} low={72} close={65} />
            <Candle x={160} open={62} high={55} low={68} close={42} />
            <Candle x={175} open={40} high={32} low={45} close={25} />
            <line x1="10" y1="10" x2="160" y2="52" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <line x1="10" y1="20" x2="160" y2="72" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="165" y="35" className="fill-bullish text-[8px]">Break</text>
          </svg>
        );
      case "rounding-bottom":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={22} high={18} low={28} close={25} />
            <Candle x={20} open={28} high={25} low={42} close={40} />
            <Candle x={35} open={42} high={40} low={55} close={52} />
            <Candle x={50} open={55} high={52} low={68} close={65} />
            <Candle x={65} open={68} high={65} low={78} close={75} />
            <Candle x={80} open={75} high={72} low={82} close={80} />
            <Candle x={95} open={80} high={78} low={85} close={82} />
            <Candle x={110} open={80} high={75} low={84} close={78} />
            <Candle x={125} open={75} high={70} low={80} close={68} />
            <Candle x={140} open={65} high={58} low={70} close={52} />
            <Candle x={155} open={50} high={42} low={55} close={38} />
            <Candle x={170} open={35} high={28} low={40} close={25} />
            <Candle x={185} open={25} high={18} low={30} close={20} />
            <line x1="5" y1="20" x2="200" y2="20" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
          </svg>
        );
      case "engulfing-bullish":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={25} open={30} high={22} low={35} close={38} />
            <Candle x={50} open={42} high={35} low={48} close={52} />
            <Candle x={75} open={55} high={48} low={62} close={68} />
            <rect x={100} y={35} width={18} height={35} className="fill-bearish stroke-bearish"/>
            <line x1="109" y1="28" x2="109" y2="35" className="stroke-bearish" strokeWidth="2"/>
            <line x1="109" y1="70" x2="109" y2="78" className="stroke-bearish" strokeWidth="2"/>
            <rect x={130} y={22} width={28} height={58} className="fill-bullish stroke-bullish"/>
            <line x1="144" y1="15" x2="144" y2="22" className="stroke-bullish" strokeWidth="2"/>
            <line x1="144" y1="80" x2="144" y2="88" className="stroke-bullish" strokeWidth="2"/>
            <Candle x={170} open={25} high={18} low={32} close={22} />
          </svg>
        );
      case "engulfing-bearish":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={25} open={70} high={65} low={78} close={62} />
            <Candle x={50} open={58} high={52} low={65} close={48} />
            <Candle x={75} open={45} high={38} low={52} close={32} />
            <rect x={100} y={35} width={18} height={35} className="fill-bullish stroke-bullish"/>
            <line x1="109" y1="28" x2="109" y2="35" className="stroke-bullish" strokeWidth="2"/>
            <line x1="109" y1="70" x2="109" y2="78" className="stroke-bullish" strokeWidth="2"/>
            <rect x={130} y={22} width={28} height={58} className="fill-bearish stroke-bearish"/>
            <line x1="144" y1="15" x2="144" y2="22" className="stroke-bearish" strokeWidth="2"/>
            <line x1="144" y1="80" x2="144" y2="88" className="stroke-bearish" strokeWidth="2"/>
            <Candle x={170} open={78} high={72} low={85} close={80} />
          </svg>
        );
      case "morning-star":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={20} open={25} high={18} low={30} close={35} />
            <rect x={50} y={22} width={22} height={48} className="fill-bearish stroke-bearish"/>
            <line x1="61" y1="15" x2="61" y2="22" className="stroke-bearish" strokeWidth="2"/>
            <line x1="61" y1="70" x2="61" y2="78" className="stroke-bearish" strokeWidth="2"/>
            <rect x={95} y={58} width={12} height={12} className="fill-muted-foreground stroke-muted-foreground"/>
            <line x1="101" y1="52" x2="101" y2="58" className="stroke-muted-foreground" strokeWidth="2"/>
            <line x1="101" y1="70" x2="101" y2="78" className="stroke-muted-foreground" strokeWidth="2"/>
            <rect x={130} y={30} width={22} height={40} className="fill-bullish stroke-bullish"/>
            <line x1="141" y1="22" x2="141" y2="30" className="stroke-bullish" strokeWidth="2"/>
            <line x1="141" y1="70" x2="141" y2="78" className="stroke-bullish" strokeWidth="2"/>
            <Candle x={175} open={28} high={22} low={35} close={25} />
          </svg>
        );
      case "evening-star":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={20} open={75} high={68} low={80} close={65} />
            <rect x={50} y={30} width={22} height={48} className="fill-bullish stroke-bullish"/>
            <line x1="61" y1="22" x2="61" y2="30" className="stroke-bullish" strokeWidth="2"/>
            <line x1="61" y1="78" x2="61" y2="85" className="stroke-bullish" strokeWidth="2"/>
            <rect x={95} y={22} width={12} height={12} className="fill-muted-foreground stroke-muted-foreground"/>
            <line x1="101" y1="15" x2="101" y2="22" className="stroke-muted-foreground" strokeWidth="2"/>
            <line x1="101" y1="34" x2="101" y2="42" className="stroke-muted-foreground" strokeWidth="2"/>
            <rect x={130} y={30} width={22} height={40} className="fill-bearish stroke-bearish"/>
            <line x1="141" y1="22" x2="141" y2="30" className="stroke-bearish" strokeWidth="2"/>
            <line x1="141" y1="70" x2="141" y2="78" className="stroke-bearish" strokeWidth="2"/>
            <Candle x={175} open={72} high={68} low={82} close={78} />
          </svg>
        );
      case "smma-bullish-crossover":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <path d="M10 76 C40 76, 70 72, 100 58 S160 24, 205 18" className="stroke-bullish" strokeWidth="3" fill="none" />
            <path d="M10 28 C50 30, 95 34, 125 42 S175 56, 205 66" className="stroke-primary" strokeWidth="3" fill="none" opacity="0.8" />
            <circle cx="112" cy="48" r="3.5" className="fill-warning" />
            <text x="118" y="42" className="fill-muted-foreground text-[8px]">21 over 200</text>
            <text x="152" y="22" className="fill-bullish text-[8px]">Bullish crossover</text>
          </svg>
        );
      case "smma-bearish-crossover":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <path d="M10 20 C40 20, 70 24, 100 40 S160 70, 205 78" className="stroke-bearish" strokeWidth="3" fill="none" />
            <path d="M10 70 C50 68, 95 62, 125 54 S175 40, 205 32" className="stroke-primary" strokeWidth="3" fill="none" opacity="0.8" />
            <circle cx="112" cy="50" r="3.5" className="fill-warning" />
            <text x="118" y="44" className="fill-muted-foreground text-[8px]">21 under 200</text>
            <text x="148" y="86" className="fill-bearish text-[8px]">Bearish crossover</text>
          </svg>
        );
      case "bull-flag-apex":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <line x1="24" y1="86" x2="24" y2="18" className="stroke-bullish" strokeWidth="4" strokeLinecap="round" />
            <polygon points="24,12 18,24 30,24" className="fill-bullish" />
            <path d="M58 38 L78 44 L98 40 L118 48 L138 46" className="stroke-primary" strokeWidth="2" fill="none" />
            <path d="M58 54 L78 58 L98 56 L118 62 L138 60" className="stroke-primary" strokeWidth="2" fill="none" opacity="0.5" />
            <line x1="146" y1="46" x2="188" y2="22" className="stroke-bullish" strokeWidth="3" strokeLinecap="round" />
            <polygon points="192,18 180,20 188,28" className="fill-bullish" />
            <text x="56" y="72" className="fill-muted-foreground text-[8px]">Apex flag pivots</text>
            <text x="144" y="18" className="fill-bullish text-[8px]">Apex breakout</text>
          </svg>
        );
      case "bear-flag-apex":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <line x1="24" y1="14" x2="24" y2="82" className="stroke-bearish" strokeWidth="4" strokeLinecap="round" />
            <polygon points="24,88 18,76 30,76" className="fill-bearish" />
            <path d="M58 60 L78 54 L98 58 L118 50 L138 52" className="stroke-primary" strokeWidth="2" fill="none" />
            <path d="M58 44 L78 38 L98 42 L118 34 L138 36" className="stroke-primary" strokeWidth="2" fill="none" opacity="0.5" />
            <line x1="146" y1="52" x2="188" y2="76" className="stroke-bearish" strokeWidth="3" strokeLinecap="round" />
            <polygon points="192,80 180,78 188,70" className="fill-bearish" />
            <text x="54" y="24" className="fill-muted-foreground text-[8px]">Apex flag pivots</text>
            <text x="144" y="90" className="fill-bearish text-[8px]">Apex breakdown</text>
          </svg>
        );
      case "hidden-bullish-divergence":
      case "regular-bullish-divergence":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <path d="M18 34 L62 46 L104 30 L146 42 L190 26" className="stroke-foreground" strokeWidth="2.5" fill="none" />
            <path d="M18 78 L62 66 L104 82 L146 70 L190 84" className="stroke-bullish" strokeWidth="2.5" fill="none" />
            <line x1="62" y1="46" x2="190" y2="26" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4" />
            <line x1="62" y1="66" x2="190" y2="84" className="stroke-bullish" strokeWidth="1.5" strokeDasharray="4" />
            <text x="12" y="22" className="fill-muted-foreground text-[7px]">Price</text>
            <text x="12" y="94" className="fill-bullish text-[7px]">Momentum</text>
            <text x="124" y="12" className="fill-bullish text-[8px]">
              {patternId === "hidden-bullish-divergence" ? "Hidden bullish" : "Regular bullish"}
            </text>
          </svg>
        );
      case "hidden-bearish-divergence":
      case "regular-bearish-divergence":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <path d="M18 66 L62 54 L104 72 L146 58 L190 76" className="stroke-foreground" strokeWidth="2.5" fill="none" />
            <path d="M18 24 L62 36 L104 18 L146 32 L190 16" className="stroke-bearish" strokeWidth="2.5" fill="none" />
            <line x1="62" y1="54" x2="190" y2="76" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4" />
            <line x1="62" y1="36" x2="190" y2="16" className="stroke-bearish" strokeWidth="1.5" strokeDasharray="4" />
            <text x="12" y="88" className="fill-muted-foreground text-[7px]">Price</text>
            <text x="12" y="14" className="fill-bearish text-[7px]">Momentum</text>
            <text x="124" y="96" className="fill-bearish text-[8px]">
              {patternId === "hidden-bearish-divergence" ? "Hidden bearish" : "Regular bearish"}
            </text>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={20} open={70} high={65} low={75} close={60} />
            <Candle x={40} open={60} high={52} low={65} close={48} />
            <Candle x={60} open={48} high={42} low={55} close={55} />
            <Candle x={80} open={55} high={50} low={62} close={45} />
            <Candle x={100} open={45} high={38} low={52} close={40} />
            <Candle x={120} open={42} high={35} low={48} close={48} />
            <Candle x={140} open={48} high={42} low={55} close={38} />
            <Candle x={160} open={38} high={30} low={45} close={32} />
            <Candle x={180} open={32} high={25} low={40} close={28} />
            <text x="80" y="90" className="fill-muted-foreground text-[10px]">Pattern</text>
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
