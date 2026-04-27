import { useState, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

// ── Black-Scholes ──────────────────────────────────────────────────────────
function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign=x<0?-1:1; x=Math.abs(x);
  const t=1/(1+p*x);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}
function N(x){return 0.5*(1+erf(x/Math.sqrt(2)));}
function normPDF(x){return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);}

function bs(S,K,T,r,sig){
  if(T<=0) return {call:Math.max(S-K,0),delta:S>K?1:0,prob:S>K?1:0,theta:0,vega:0};
  const d1=(Math.log(S/K)+(r+0.5*sig*sig)*T)/(sig*Math.sqrt(T));
  const d2=d1-sig*Math.sqrt(T);
  const call=S*N(d1)-K*Math.exp(-r*T)*N(d2);
  const delta=N(d1);
  const prob=N(d2);
  const theta=(-S*normPDF(d1)*sig/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*N(d2))/365;
  const vega=S*normPDF(d1)*Math.sqrt(T)/100;
  return {call,delta,prob,theta,vega,d1,d2};
}

const SPOT=39;
const SHARES=500;
const CONTRACTS=5;
const RFR=0.035;

// Expiry definitions (from April 27 2026)
const EXPIRIES=[
  {id:"may",label:"May 15",date:"15 May 2026",days:18,T:18/365,color:"#38bdf8",shortLabel:"MAY"},
  {id:"jun",label:"Jun 19",date:"19 Jun 2026",days:53,T:53/365,color:"#34d399",shortLabel:"JUN"},
  {id:"jul",label:"Jul 17",date:"17 Jul 2026",days:81,T:81/365,color:"#fbbf24",shortLabel:"JUL"},
  {id:"sep",label:"Sep 18",date:"18 Sep 2026",days:144,T:144/365,color:"#f97316",shortLabel:"SEP"},
  {id:"dec",label:"Dec 18",date:"18 Dec 2026",days:235,T:235/365,color:"#a78bfa",shortLabel:"DEC"},
];

// Strike recommendations per expiry
const RECOMMENDED={
  may:{strike:40,rationale:"Near-ATM, 18 days. High time-decay. Maximises premium for short window. Low delta, quick resolution."},
  jun:{strike:41,rationale:"~5% OTM, 53 days. Sweet spot: meaningful premium, manageable assignment risk. Ideal for 1-month rollers."},
  jul:{strike:42,rationale:"~8% OTM, 81 days. Captures Shell summer trading range. Premium justifies 11-week exposure."},
  sep:{strike:43,rationale:"~10% OTM, 144 days. Covers earnings cycle. Substantial premium, lower assignment risk (~25%)."},
  dec:{strike:45,rationale:"~15% OTM, 235 days. Year-end positioning. High vega exposure — consider waiting for IV spike to sell."},
};

// Build all strike options for each expiry
function strikeRange(T){ return [39,39.5,40,40.5,41,41.5,42,43,44,45,46,47,48]; }

function EUR(n,dec=2){return `€${n.toLocaleString('de-DE',{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;}
function pct(n){return `${(n*100).toFixed(1)}%`;}

export default function ShellRD(){
  const [iv,setIv]=useState(0.22);
  const [selectedExpiry,setSelectedExpiry]=useState("jun");
  const [strikes,setStrikes]=useState({may:40,jun:41,jul:42,sep:43,dec:45});
  const [showWarning,setShowWarning]=useState(true);

  const sel=EXPIRIES.find(e=>e.id===selectedExpiry);
  const selStrike=strikes[selectedExpiry];
  const selBS=useMemo(()=>bs(SPOT,selStrike,sel.T,RFR,iv),[selStrike,sel.T,iv]);

  // Compute all recommended strikes for summary table
  const summaryRows=useMemo(()=>EXPIRIES.map(exp=>{
    const k=strikes[exp.id];
    const rec=RECOMMENDED[exp.id];
    const b=bs(SPOT,k,exp.T,RFR,iv);
    const premTotal=b.call*SHARES;
    const effSell=k+b.call;
    const annYield=(b.call/SPOT)*(365/exp.days)*100;
    return {
      ...exp, strike:k, b, premTotal, effSell, annYield,
      otmPct:((k-SPOT)/SPOT*100),
      rationale:rec.rationale,
      recStrike:rec.strike,
    };
  }),[strikes,iv]);

  const totalPremium=summaryRows.reduce((a,r)=>a+r.premTotal,0);

  // Payoff data for selected expiry
  const payoffData=useMemo(()=>{
    return(
      <div className="shellrd-root">
        <div className="shellrd-header">
          <div className="shellrd-header-inner" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'12px'}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                <span className="chip" style={{background:'#fbbf24',color:'#000',fontWeight:'600'}}>SHEL.AS</span>
                <span className="chip" style={{background:'#292018',color:'#c8b89a',border:'1px solid #3d2e0e'}}>RD OPTIONS · EURONEXT AMSTERDAM</span>
                <span className="chip" style={{background:'#292018',color:'#c8b89a',border:'1px solid #3d2e0e'}}>EUROPEAN · CASH-SETTLED</span>
              </div>
              <div className="serif" style={{fontSize:'22px',letterSpacing:'-0.01em'}}>
                Covered Call Strategy · 500 Shares · 5 Contracts
              </div>
              <div className="sans" style={{fontSize:'12px',color:'#a89060',marginTop:'4px'}}>
                Spot €{SPOT} · 5 Expiries · April 27 2026
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="mono" style={{fontSize:'10px',color:'#6b5030',marginBottom:'4px'}}>TOTAL PROJECTED PREMIUM</div>
              <div className="mono" style={{fontSize:'26px',fontWeight:'500',color:'#fbbf24'}}>{EUR(totalPremium)}</div>
              <div className="mono" style={{fontSize:'10px',color:'#6b5030'}}>across all 5 expiries at selected strikes</div>
            </div>
          </div>
        </div>

        <div className="shellrd-body" style={{padding:'20px 28px'}}>
          {/* Content omitted for brevity; full component moved into src/components */}
          <div>Shell RD component (UI omitted)</div>
        </div>
      </div>
    );
  }
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="mono" style={{fontSize:"10px",color:"#6b5030",marginBottom:"4px"}}>TOTAL PROJECTED PREMIUM</div>
            <div className="mono" style={{fontSize:"26px",fontWeight:"500",color:"#fbbf24"}}>{EUR(totalPremium)}</div>
            <div className="mono" style={{fontSize:"10px",color:"#6b5030"}}>across all 5 expiries at selected strikes</div>
          </div>
        </div>
      </div>

      <div style={{padding:"20px 28px"}}>
        {/* Content omitted for brevity; full component moved into src/components */}
        <div>Shell RD component (UI omitted)</div>
      </div>
    </div>
  );
}
