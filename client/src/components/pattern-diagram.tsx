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
            <Candle x={5} open={85} high={80} low={90} close={75} />
            <Candle x={20} open={75} high={65} low={78} close={55} />
            <Candle x={35} open={55} high={45} low={58} close={35} />
            <Candle x={50} open={35} high={25} low={38} close={22} />
            <Candle x={65} open={28} high={22} low={35} close={32} />
            <Candle x={80} open={35} high={30} low={42} close={38} />
            <Candle x={95} open={40} high={36} low={48} close={45} />
            <Candle x={110} open={43} high={38} low={50} close={48} />
            <Candle x={125} open={46} high={40} low={52} close={42} />
            <Candle x={140} open={40} high={35} low={45} close={38} />
            <Candle x={155} open={36} high={28} low={40} close={20} />
            <Candle x={170} open={20} high={12} low={24} close={15} />
            <line x1="50" y1="22" x2="155" y2="35" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <line x1="65" y1="35" x2="155" y2="50" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="75" y="62" className="fill-muted-foreground text-[8px]">Flag</text>
            <text x="15" y="95" className="fill-muted-foreground text-[8px]">Pole</text>
          </svg>
        );
      case "bear-flag":
        return (
          <svg viewBox="0 0 220 100" className="w-full h-full">
            <Candle x={5} open={15} high={10} low={20} close={25} />
            <Candle x={20} open={25} high={22} low={40} close={45} />
            <Candle x={35} open={45} high={42} low={60} close={65} />
            <Candle x={50} open={65} high={62} low={78} close={78} />
            <Candle x={65} open={72} high={68} low={78} close={70} />
            <Candle x={80} open={68} high={62} low={72} close={65} />
            <Candle x={95} open={63} high={58} low={68} close={60} />
            <Candle x={110} open={58} high={52} low={62} close={55} />
            <Candle x={125} open={57} high={52} low={62} close={58} />
            <Candle x={140} open={60} high={55} low={65} close={62} />
            <Candle x={155} open={64} high={60} low={78} close={80} />
            <Candle x={170} open={80} high={78} low={92} close={90} />
            <line x1="50" y1="78" x2="155" y2="65" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <line x1="65" y1="68" x2="155" y2="52" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4"/>
            <text x="75" y="48" className="fill-muted-foreground text-[8px]">Flag</text>
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
