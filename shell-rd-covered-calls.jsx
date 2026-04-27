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
// For income + exit: tight OTM for near-term, wider for far-term
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
    const pts=[];
    for(let p=28;p<=56;p+=0.5){
      const ccPnl=Math.min(selStrike-SPOT,p-SPOT)*SHARES+selBS.call*SHARES;
      const directPnl=(p-SPOT)*SHARES;
      pts.push({price:p,ccPnl,directPnl});
    }
    return pts;
  },[selStrike,selBS.call]);

  const barData=summaryRows.map(r=>({
    label:r.shortLabel,
    premium:+r.b.call.toFixed(3),
    annYield:+r.annYield.toFixed(1),
    prob:+(r.b.prob*100).toFixed(1),
    color:r.color,
  }));

  return(
    <div style={{
      background:"#f8f4ee",
      minHeight:"100vh",
      fontFamily:"'DM Serif Display',Georgia,serif",
      color:"#1a1008",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;}
        .mono{font-family:'DM Mono',monospace;}
        .sans{font-family:'DM Sans',sans-serif;}
        .serif{font-family:'DM Serif Display',Georgia,serif;}
        .chip{display:inline-block;padding:2px 9px;font-size:10px;font-family:'DM Mono',monospace;letter-spacing:0.06em;border-radius:2px;}
        .exp-tab{border:1.5px solid;padding:8px 14px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.06em;transition:all 0.2s;border-radius:3px;}
        .strike-btn{background:transparent;border:1px solid #c8b89a;padding:4px 10px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;border-radius:2px;transition:all 0.15s;}
        .strike-btn:hover{background:#e8dcc8;border-color:#8b6914;}
        .strike-btn.sel{background:#8b6914;color:#f8f4ee;border-color:#8b6914;}
        input[type=range]{-webkit-appearance:none;width:100%;height:3px;background:#c8b89a;outline:none;border-radius:2px;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#8b6914;border-radius:50%;cursor:pointer;}
        .row-hover:hover{background:rgba(139,105,20,0.06);}
        .warn-box{border-left:4px solid #dc2626;background:#fef2f2;padding:14px 16px;border-radius:3px;font-family:'DM Sans',sans-serif;font-size:12px;color:#7f1d1d;line-height:1.7;}
        .info-box{border-left:4px solid #8b6914;background:#fef9ee;padding:14px 16px;border-radius:3px;font-family:'DM Sans',sans-serif;font-size:12px;color:#451a03;line-height:1.7;}
        .card-section{background:#fff;border:1px solid #e8dcc8;border-radius:4px;padding:18px;}
        .divider{border:none;border-top:1px solid #e8dcc8;margin:16px 0;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.3s ease forwards;}
      `}</style>

      {/* Header */}
      <div style={{background:"#1a1008",color:"#f8f4ee",padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"12px"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
              <span className="chip" style={{background:"#fbbf24",color:"#000",fontWeight:"600"}}>SHEL.AS</span>
              <span className="chip" style={{background:"#292018",color:"#c8b89a",border:"1px solid #3d2e0e"}}>RD OPTIONS · EURONEXT AMSTERDAM</span>
              <span className="chip" style={{background:"#292018",color:"#c8b89a",border:"1px solid #3d2e0e"}}>EUROPEAN · CASH-SETTLED</span>
            </div>
            <div className="serif" style={{fontSize:"22px",letterSpacing:"-0.01em"}}>
              Covered Call Strategy · 500 Shares · 5 Contracts
            </div>
            <div className="sans" style={{fontSize:"12px",color:"#a89060",marginTop:"4px"}}>
              Spot €{SPOT} · 5 Expiries · April 27 2026
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

        {/* ── CRITICAL WARNING ── */}
        {showWarning && (
          <div className="warn-box fade-in" style={{marginBottom:"16px",position:"relative"}}>
            <button onClick={()=>setShowWarning(false)} style={{position:"absolute",top:"10px",right:"12px",background:"transparent",border:"none",cursor:"pointer",fontSize:"16px",color:"#dc2626"}}>×</button>
            <div style={{fontWeight:"700",fontSize:"13px",marginBottom:"6px"}}>⚠ CRITICAL: Shell RD Options Are Cash-Settled (European-Style)</div>
            <div>Shell <strong>RD (Royal Dutch) options</strong> on Euronext are <strong>European-style and cash-settled</strong>. Upon "assignment" at expiry, no physical shares are exchanged — only the intrinsic cash difference is paid. This means:</div>
            <div style={{marginTop:"8px",paddingLeft:"12px"}}>
              <div>• Your <strong>500 physical SHEL.AS shares are NOT delivered</strong> — you keep them regardless of outcome</div>
              <div>• If a call expires ITM, you pay the cash difference (loss on short call), but your shares stay in your account</div>
              <div>• The P&amp;L profile is <em>economically identical</em> to a physical covered call, but the <strong>shares do NOT automatically get sold</strong></div>
              <div>• If your goal is to <strong>divest the 500 shares</strong>, you must sell them separately in the equity market</div>
            </div>
            <div style={{marginTop:"8px",fontWeight:"600",color:"#991b1b"}}>
              For automatic share delivery: use <strong>AEB (Amsterdam Exchange Board) options</strong> — physically settled, American-style. These are the correct instrument for a traditional covered call exit.
            </div>
          </div>
        )}

        {/* ── Settlement Explainer ── */}
        <div className="info-box" style={{marginBottom:"20px"}}>
          <div style={{fontWeight:"600",marginBottom:"4px"}}>How to use RD calls for income on 500 shares</div>
          RD covered calls work perfectly as an <strong>income layer</strong> while you hold the physical position. The premium is yours unconditionally. If you also want to divest, run the RD calls in parallel with a <strong>limit sell order</strong> on your SHEL.AS shares at or above the strike — you capture both the premium and the targeted exit price. Think of RD as the <em>income engine</em>, AEB as the <em>exit vehicle</em>.
        </div>

        {/* ── IV Slider ── */}
        <div className="card-section" style={{marginBottom:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"20px",flexWrap:"wrap"}}>
            <div className="mono" style={{fontSize:"10px",color:"#8b6914",letterSpacing:"0.1em"}}>IMPLIED VOLATILITY</div>
            <div className="mono" style={{fontSize:"18px",fontWeight:"500",color:"#1a1008"}}>{(iv*100).toFixed(0)}%</div>
            <div style={{flex:1,minWidth:"160px"}}>
              <input type="range" min={0.12} max={0.45} step={0.01} value={iv} onChange={e=>setIv(+e.target.value)} />
            </div>
            <div className="sans" style={{fontSize:"11px",color:"#8b6914"}}>
              {iv<0.18?"Low IV — consider waiting for a spike before selling"
               :iv<0.28?"Normal Shell IV range — good time to sell calls"
               :"Elevated IV — premium-rich environment, excellent to sell"}
            </div>
          </div>
        </div>

        {/* ── Summary Table ── */}
        <div className="card-section" style={{marginBottom:"16px",overflowX:"auto"}}>
          <div className="mono" style={{fontSize:"10px",color:"#8b6914",letterSpacing:"0.1em",marginBottom:"14px"}}>EXPIRY STRATEGY SUMMARY · 500 SHARES · 5 CONTRACTS</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",fontFamily:"'DM Mono',monospace"}}>
            <thead>
              <tr style={{borderBottom:"2px solid #1a1008"}}>
                {["Expiry","Days","Rec Strike","OTM %","Prem/sh","Total Prem","Eff. Sell","Ann. Yield","P(assign)","Action"].map(h=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:"right",fontWeight:"500",fontSize:"10px",color:"#8b6914",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
                    {h==="Expiry"||h==="Action"?<span style={{textAlign:"left",display:"block"}}>{h}</span>:h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r,i)=>{
                const isRec=r.strike===r.recStrike;
                return(
                  <tr key={r.id} className="row-hover" onClick={()=>setSelectedExpiry(r.id)}
                    style={{borderBottom:"1px solid #e8dcc8",cursor:"pointer",background:selectedExpiry===r.id?"#fef9ee":"transparent",transition:"background 0.15s"}}>
                    <td style={{padding:"8px 8px",fontWeight:"600"}}>
                      <span style={{color:r.color}}>●</span> {r.label}
                    </td>
                    <td style={{padding:"8px 8px",textAlign:"right",color:"#8b6914"}}>{r.days}d</td>
                    <td style={{padding:"8px 8px",textAlign:"right"}}>
                      <span style={{background:isRec?"#8b6914":"#e8dcc8",color:isRec?"#f8f4ee":"#8b6914",padding:"2px 7px",borderRadius:"2px"}}>
                        €{r.strike.toFixed(1)}
                      </span>
                    </td>
                    <td style={{padding:"8px 8px",textAlign:"right",color:r.otmPct>10?"#059669":r.otmPct>5?"#d97706":"#dc2626"}}>
                      +{r.otmPct.toFixed(1)}%
                    </td>
                    <td style={{padding:"8px 8px",textAlign:"right",color:"#059669",fontWeight:"600"}}>{EUR(r.b.call)}</td>
                    <td style={{padding:"8px 8px",textAlign:"right",color:"#059669",fontWeight:"700"}}>{EUR(r.premTotal,0)}</td>
                    <td style={{padding:"8px 8px",textAlign:"right"}}>{EUR(r.effSell)}</td>
                    <td style={{padding:"8px 8px",textAlign:"right",color:r.annYield>30?"#059669":r.annYield>15?"#d97706":"#64748b"}}>
                      {r.annYield.toFixed(1)}% pa
                    </td>
                    <td style={{padding:"8px 8px",textAlign:"right"}}>
                      <span style={{color:r.b.prob<0.3?"#059669":r.b.prob<0.5?"#d97706":"#dc2626"}}>
                        {pct(r.b.prob)}
                      </span>
                    </td>
                    <td style={{padding:"8px 8px",textAlign:"left"}}>
                      <span className="chip" style={{background:"#1a1008",color:"#fbbf24",fontSize:"9px"}}>SELL CALL</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{borderTop:"2px solid #1a1008",background:"#fef9ee"}}>
                <td colSpan="4" style={{padding:"8px",fontWeight:"700",fontFamily:"'DM Sans',sans-serif",fontSize:"12px"}}>AGGREGATE INCOME</td>
                <td></td>
                <td style={{padding:"8px",textAlign:"right",fontWeight:"700",color:"#059669",fontSize:"14px"}}>{EUR(totalPremium,0)}</td>
                <td colSpan="4" style={{padding:"8px",fontSize:"10px",color:"#8b6914",fontFamily:"'DM Sans',sans-serif"}}>
                  Total premium across all 5 expiries if all legs opened simultaneously
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="sans" style={{fontSize:"10px",color:"#a89060",marginTop:"8px"}}>Click any row to detail that expiry below</div>
        </div>

        {/* ── Detail Panel ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
          {/* Left: Selected Expiry Detail */}
          <div className="card-section fade-in">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div>
                <span className="chip" style={{background:sel.color,color:"#000",marginRight:"8px"}}>{sel.label}</span>
                <span className="mono" style={{fontSize:"10px",color:"#8b6914"}}>{sel.date} · {sel.days} DAYS TO EXPIRY</span>
              </div>
            </div>

            {/* Strike selector */}
            <div className="mono" style={{fontSize:"10px",color:"#8b6914",marginBottom:"8px"}}>ADJUST STRIKE</div>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginBottom:"14px"}}>
              {strikeRange().map(k=>{
                const b2=bs(SPOT,k,sel.T,RFR,iv);
                const isRec=k===RECOMMENDED[sel.id].strike;
                return(
                  <button key={k} className={`strike-btn ${strikes[sel.id]===k?"sel":""}`}
                    onClick={()=>setStrikes(s=>({...s,[sel.id]:k}))}>
                    €{k.toFixed(1)}{isRec?" ★":""}
                  </button>
                );
              })}
            </div>

            <hr className="divider" />

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {[
                {label:"Call Premium / share",val:EUR(selBS.call),big:true,color:"#059669"},
                {label:"Total Premium (5 contracts)",val:EUR(selBS.call*SHARES),big:true,color:"#059669"},
                {label:"Effective sell price",val:EUR(selStrike+selBS.call),color:"#1a1008"},
                {label:"Upside vs spot",val:`+${EUR(selStrike+selBS.call-SPOT)}`,color:"#059669"},
                {label:"P(assigned at expiry)",val:pct(selBS.prob),color:selBS.prob<0.3?"#059669":selBS.prob<0.5?"#d97706":"#dc2626"},
                {label:"Delta (directional exposure)",val:selBS.delta.toFixed(3),color:"#1a1008"},
                {label:"Daily theta (€ earned/day)",val:EUR(Math.abs(selBS.theta)*SHARES),color:"#7c3aed"},
                {label:"Annualised yield",val:`${((selBS.call/SPOT)*(365/sel.days)*100).toFixed(1)}% pa`,color:"#d97706"},
              ].map(m=>(
                <div key={m.label} style={{padding:"8px",background:"#f8f4ee",borderRadius:"3px",borderLeft:`3px solid ${m.color||"#c8b89a"}`}}>
                  <div className="mono" style={{fontSize:"9px",color:"#8b6914",letterSpacing:"0.08em"}}>{m.label}</div>
                  <div className="mono" style={{fontSize:m.big?"16px":"13px",fontWeight:m.big?"600":"400",color:m.color||"#1a1008",marginTop:"3px"}}>{m.val}</div>
                </div>
              ))}
            </div>

            <hr className="divider" />
            <div className="sans" style={{fontSize:"11px",color:"#451a03",lineHeight:"1.7",background:"#fef9ee",padding:"10px",borderRadius:"3px"}}>
              <strong>Rationale:</strong> {RECOMMENDED[sel.id].rationale}
            </div>
          </div>

          {/* Right: Payoff chart */}
          <div className="card-section">
            <div className="mono" style={{fontSize:"10px",color:"#8b6914",marginBottom:"12px"}}>
              P&L AT EXPIRY · {sel.label} · €{selStrike} STRIKE
            </div>
            <div style={{height:"240px"}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payoffData} margin={{top:5,right:10,bottom:5,left:50}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc8" />
                  <XAxis dataKey="price" stroke="#a89060" fontSize={9} tickFormatter={v=>`€${v}`} />
                  <YAxis stroke="#a89060" fontSize={9} tickFormatter={v=>v>=0?`+€${(v/1000).toFixed(0)}k`:`-€${(Math.abs(v)/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{background:"#fff",border:"1px solid #e8dcc8",fontSize:"11px",fontFamily:"'DM Mono',monospace"}}
                    labelFormatter={v=>`Shell @ €${v}`}
                    formatter={(val,name)=>[`${val>=0?"+":""}€${(val).toFixed(0)}`,name]} />
                  <ReferenceLine x={SPOT} stroke="#a89060" strokeDasharray="4 4" label={{value:"SPOT",fill:"#a89060",fontSize:9}} />
                  <ReferenceLine x={selStrike} stroke={sel.color} strokeDasharray="4 4" label={{value:`STRIKE €${selStrike}`,fill:sel.color,fontSize:9}} />
                  <ReferenceLine y={0} stroke="#c8b89a" />
                  <Line type="monotone" dataKey="directPnl" stroke="#c8b89a" strokeWidth={1.5} dot={false} name="Hold only" strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="ccPnl" stroke="#1a1008" strokeWidth={2.5} dot={false} name="CC strategy" />
                  <Legend wrapperStyle={{fontSize:"11px",fontFamily:"'DM Mono',monospace"}} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <hr className="divider" />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
              {[
                {label:"Max gain",val:EUR((selStrike-SPOT+selBS.call)*SHARES),color:"#059669"},
                {label:"Breakeven",val:`€${(SPOT-selBS.call).toFixed(2)}`,color:"#d97706"},
                {label:"Premium cushion",val:EUR(selBS.call)+" /sh",color:"#7c3aed"},
              ].map(m=>(
                <div key={m.label} style={{textAlign:"center",padding:"8px",background:"#f8f4ee",borderRadius:"3px"}}>
                  <div className="mono" style={{fontSize:"9px",color:"#8b6914"}}>{m.label}</div>
                  <div className="mono" style={{fontSize:"13px",fontWeight:"600",color:m.color,marginTop:"4px"}}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Premium & Yield Bar Charts ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
          <div className="card-section">
            <div className="mono" style={{fontSize:"10px",color:"#8b6914",marginBottom:"12px"}}>TOTAL PREMIUM PER EXPIRY (€ · 5 contracts)</div>
            <div style={{height:"170px"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summaryRows.map(r=>({label:r.shortLabel,premium:+r.premTotal.toFixed(0),color:r.color}))}
                  margin={{top:5,right:10,bottom:5,left:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc8" />
                  <XAxis dataKey="label" stroke="#a89060" fontSize={10} />
                  <YAxis stroke="#a89060" fontSize={9} tickFormatter={v=>`€${v}`} />
                  <Tooltip contentStyle={{background:"#fff",border:"1px solid #e8dcc8",fontSize:"11px"}}
                    formatter={(v)=>[EUR(v),"Total premium"]} />
                  <Bar dataKey="premium" radius={[3,3,0,0]}
                    shape={props=>{
                      const row=summaryRows.find(r=>r.shortLabel===props.label);
                      return <rect {...props} fill={row?row.color:"#8b6914"} opacity={0.85} />;
                    }}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-section">
            <div className="mono" style={{fontSize:"10px",color:"#8b6914",marginBottom:"12px"}}>ANNUALISED YIELD vs P(ASSIGNMENT) %</div>
            <div style={{height:"170px"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{top:5,right:10,bottom:5,left:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc8" />
                  <XAxis dataKey="label" stroke="#a89060" fontSize={10} />
                  <YAxis stroke="#a89060" fontSize={9} tickFormatter={v=>`${v}%`} />
                  <Tooltip contentStyle={{background:"#fff",border:"1px solid #e8dcc8",fontSize:"11px"}}
                    formatter={(v,n)=>[`${v.toFixed(1)}%`,n]} />
                  <Legend wrapperStyle={{fontSize:"10px"}} />
                  <Bar dataKey="annYield" name="Ann. Yield %" fill="#8b6914" opacity={0.8} radius={[3,3,0,0]} />
                  <Bar dataKey="prob" name="P(assign) %" fill="#dc2626" opacity={0.5} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Execution Guide ── */}
        <div className="card-section" style={{marginBottom:"16px"}}>
          <div className="mono" style={{fontSize:"10px",color:"#8b6914",letterSpacing:"0.1em",marginBottom:"14px"}}>IBKR EXECUTION GUIDE · SELL RD CALLS ON EURONEXT</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px",fontSize:"12px",fontFamily:"'DM Sans',sans-serif"}}>
            {[
              {step:"01",title:"Locate the option chain",body:"In IBKR TWS or mobile: underlying = SHEL, Exchange = AEB (for RD options, search 'SHELL' and select the Euronext-listed option chain). Ensure you see the RD series — European style, cash-settled."},
              {step:"02",title:"Select expiry & strike",body:"Navigate to the recommended expiry month. Select your chosen strike (★ marked in table above). Always check the bid-ask spread — AEX options can be wide; use mid-price limit orders."},
              {step:"03",title:"Order type: Sell to Open",body:"Action = SELL, Qty = 1 contract per 100 shares (5 contracts for 500 shares). Order type = Limit at mid-price. Mark as 'covered' in IBKR account designation if prompted."},
              {step:"04",title:"Monitor & manage",body:"Set a GTC buy-to-close order at 20–30% of premium received (lock in gains early if stock falls). Roll forward before expiry if >50% ITM — don't wait until expiry day."},
              {step:"05",title:"At expiry — cash settlement",body:"If expired ITM: IBKR automatically settles in cash — no action needed. Your physical shares stay in your account. If you wish to sell shares separately, place a separate equity sell order at your target price."},
              {step:"06",title:"Tax note (Netherlands)",body:"Options income on Euronext may be subject to Box 3 wealth tax or Box 1 trading income depending on frequency. Consult a Dutch tax adviser for treatment of derivatives income on physical share holdings."},
            ].map(s=>(
              <div key={s.step} style={{padding:"12px",background:"#f8f4ee",borderRadius:"3px"}}>
                <div style={{display:"flex",gap:"10px",alignItems:"flex-start"}}>
                  <div className="mono" style={{fontSize:"22px",color:"#e8dcc8",fontWeight:"500",lineHeight:"1"}}>{s.step}</div>
                  <div>
                    <div style={{fontWeight:"600",marginBottom:"4px",color:"#1a1008"}}>{s.title}</div>
                    <div style={{color:"#6b5030",lineHeight:"1.6",fontSize:"11px"}}>{s.body}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Economist Verdict ── */}
        <div style={{background:"#1a1008",color:"#f8f4ee",padding:"20px",borderRadius:"4px"}}>
          <div className="mono" style={{fontSize:"10px",color:"#8b6914",letterSpacing:"0.12em",marginBottom:"12px"}}>◈ STRATEGY RECOMMENDATION</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px",fontSize:"13px",lineHeight:"1.75",fontFamily:"'DM Sans',sans-serif"}}>
            <div>
              <div className="serif" style={{fontSize:"16px",marginBottom:"8px",color:"#fbbf24"}}>Lead with June 19 · €41 strike</div>
              This is your anchor trade. At 53 days, it's in the sweet spot of theta decay (time value erodes fastest between 30–60 DTE). The €41 strike is ~5% OTM — meaningful premium without high assignment risk (~30–35%). Open this first.
              <div style={{marginTop:"10px"}}>
                <span className="chip" style={{background:"#34d399",color:"#000"}}>★ PRIMARY</span>
                <span className="mono" style={{fontSize:"12px",color:"#34d399",marginLeft:"10px"}}>~{EUR(bs(SPOT,41,53/365,RFR,iv).call*500)} upfront</span>
              </div>
            </div>
            <div>
              <div className="serif" style={{fontSize:"16px",marginBottom:"8px",color:"#a78bfa"}}>Use Sep + Dec for income, May cautiously</div>
              Sep and Dec offer substantial annualised yields but expose you to longer vega risk — sell these if IV is elevated. <strong style={{color:"#fbbf24"}}>May 15 is very short</strong> (18 days): premium is thin; only worth doing if you want quick resolution or are near a specific news event. Avoid stacking all 5 simultaneously — stagger by 2–3 weeks for cash flow management.
            </div>
          </div>
          <hr style={{borderColor:"#3d2e0e",margin:"14px 0"}} />
          <div className="mono" style={{fontSize:"10px",color:"#6b5030"}}>
            MODEL: BLACK-SCHOLES · EURONEXT RD CASH-SETTLED · FOR ILLUSTRATION ONLY · NOT FINANCIAL ADVICE · CONSULT A REGULATED ADVISER · OPTIONS INVOLVE RISK OF LOSS
          </div>
        </div>
      </div>
    </div>
  );
}
