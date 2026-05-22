import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { loadOptpilotTradeRows, resolveOptpilotUserId } from "../lib/optpilotFirestore.js";
import { useOptPilotAuth } from "../context/OptPilotAuthContext.jsx";

const OCC_RE = /^([A-Z]+)(\d{6})([CP])(\d+)$/;
const COMBO_HDR_RE = /^([A-Z]+)\d{6}[CP]\d+\/\d{6}[CP]\d+$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const numberFmt = new Intl.NumberFormat("en-US");

const USER_KEYS = ["A", "B", "C"];

function isoDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getIsoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function parseSymbol(symbol) {
  const m = OCC_RE.exec(String(symbol || "").trim());
  if (!m) return null;

  const [, ticker, dateStr, optionType, strikeStr] = m;
  const yy = Number(dateStr.slice(0, 2));
  const mm = Number(dateStr.slice(2, 4));
  const dd = Number(dateStr.slice(4, 6));
  const expiry = new Date(2000 + yy, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;

  return {
    ticker,
    expiry,
    option_type: optionType,
    strike: Number(strikeStr) / 1000,
  };
}

function parseDt(input) {
  if (!input) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "object") {
    if (typeof input.toDate === "function") {
      const d = input.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (Number.isFinite(input.seconds)) {
      const d = new Date(input.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const raw = String(input || "").trim().replace(" ET", "").replace(" MYT", "");
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const match = /^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/.exec(raw);
  if (!match) return null;

  const month = MONTHS.indexOf(match[1]);
  if (month < 0) return null;

  const d = new Date(Number(match[3]), month, Number(match[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmount(input) {
  const n = Number(String(input || "").replace(/[$,]/g, "").trim() || "0");
  return Number.isFinite(n) ? n : 0;
}

function parseQty(input) {
  const n = Number(String(input || "").replace(/,/g, "").replace("unit(s)", "").trim() || "1");
  return Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 1;
}

function dateLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function classifyRoll(btc, sto, isCalendar) {
  const sameStrike = Math.abs(btc.strike - sto.strike) < 0.001;
  const sameExpiry = isoDate(btc.expiry) === isoDate(sto.expiry);
  const optionType = btc.option_type;

  const expiryDir = !sameExpiry ? (sto.expiry > btc.expiry ? "Out" : "In") : "";
  let strikeDir = "";

  if (!sameStrike) {
    if (optionType === "P") {
      strikeDir = sto.strike < btc.strike ? "Down" : "Up";
    } else {
      strikeDir = sto.strike > btc.strike ? "Up" : "Down";
    }
  }

  if (isCalendar || (sameStrike && !sameExpiry)) {
    return `Calendar Roll ${expiryDir}`.trim();
  }
  if (sameExpiry && !sameStrike) {
    return `Roll ${strikeDir}`.trim();
  }
  if (!sameStrike && !sameExpiry) {
    return `Roll ${strikeDir} & ${expiryDir}`.trim();
  }
  return "Roll (Same)";
}

function shortLeg(symbol) {
  const parsed = parseSymbol(symbol);
  if (!parsed) return symbol;
  const s = parsed.strike;
  const strikeStr = Number.isInteger(s) ? `$${s}` : `$${s.toFixed(2)}`;
  return `${dateLabel(parsed.expiry)} ${strikeStr}${parsed.option_type}`;
}

function canonicalKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeRows(rawRows) {
  const keyMap = {
    symbol: "Symbol",
    name: "Name",
    status: "Status",
    side: "Side",
    ordertime: "Order Time",
    filltime: "Fill Time",
    fillqty: "Fill Qty",
    fillprice: "Fill Price",
    fillamount: "Fill Amount",
    ordersource: "Order Source",
    total: "Total",
    fees: "Total",
  };

  return (Array.isArray(rawRows) ? rawRows : []).map((row) => {
    const out = {
      Symbol: "",
      Name: "",
      Status: "",
      Side: "",
      "Order Time": "",
      "Fill Time": "",
      "Fill Qty": "",
      "Fill Price": "",
      "Fill Amount": "",
      "Order Source": "",
      Total: "",
    };

    Object.entries(row || {}).forEach(([k, v]) => {
      const mapped = keyMap[canonicalKey(k)] || k;
      out[mapped] = v;
    });

    return out;
  });
}

function processRows(rawRows) {
  const rows = normalizeRows(rawRows);
  const skipIdx = new Set();
  const comboTrades = [];

  for (let i = 0; i < rows.length; i += 1) {
    if (skipIdx.has(i)) continue;

    const row = rows[i] || {};
    const symbol = String(row.Symbol || "").trim();
    const name = String(row.Name || "").trim();
    const status = String(row.Status || "").trim();

    if (status === "Cancelled") {
      skipIdx.add(i);
      continue;
    }

    const isCombo =
      symbol.includes("/") &&
      COMBO_HDR_RE.test(symbol) &&
      ["Custom", "Calendar Spread", "Spread"].some((kw) => name.includes(kw));

    if (!isCombo) continue;
    if (i + 2 >= rows.length) {
      skipIdx.add(i);
      continue;
    }

    const leg1 = rows[i + 1] || {};
    const leg2 = rows[i + 2] || {};
    const s1 = String(leg1.Side || "").trim();
    const s2 = String(leg2.Side || "").trim();

    let btcRow;
    let stoRow;

    if (s1 === "Buy" && s2 === "Sell") {
      btcRow = leg1;
      stoRow = leg2;
    } else if (s1 === "Sell" && s2 === "Buy") {
      btcRow = leg2;
      stoRow = leg1;
    } else {
      skipIdx.add(i);
      skipIdx.add(i + 1);
      skipIdx.add(i + 2);
      continue;
    }

    const btcParsed = parseSymbol(String(btcRow.Symbol || "").trim());
    const stoParsed = parseSymbol(String(stoRow.Symbol || "").trim());
    if (!btcParsed || !stoParsed) {
      skipIdx.add(i);
      skipIdx.add(i + 1);
      skipIdx.add(i + 2);
      continue;
    }

    const comboTime = parseDt(row["Order Time"]) || parseDt(leg1["Fill Time"]);
    if (!comboTime) {
      skipIdx.add(i);
      skipIdx.add(i + 1);
      skipIdx.add(i + 2);
      continue;
    }

    const comboFees = Math.abs(parseAmount(row.Total));
    const contracts = Math.max(parseQty(btcRow["Fill Qty"]), parseQty(stoRow["Fill Qty"]));
    const btcAmount = Math.abs(parseAmount(btcRow["Fill Amount"]));
    const stoAmount = Math.abs(parseAmount(stoRow["Fill Amount"]));
    const netCredit = stoAmount - btcAmount - comboFees;

    const isCalendar = name.includes("Calendar Spread");
    const rollLabel = classifyRoll(btcParsed, stoParsed, isCalendar);
    const strategy = stoParsed.option_type === "C" ? "CC" : "CSP";
    const strikeDelta = stoParsed.strike - btcParsed.strike;
    const expiryDelta = Math.round((stoParsed.expiry - btcParsed.expiry) / 86400000);

    comboTrades.push({
      row_type: "combo",
      combo_symbol: symbol,
      ticker: stoParsed.ticker,
      strategy,
      roll_label: rollLabel,
      is_calendar: isCalendar,
      btc_symbol: String(btcRow.Symbol || "").trim(),
      btc_expiry: isoDate(btcParsed.expiry),
      btc_strike: btcParsed.strike,
      btc_opt_type: btcParsed.option_type,
      btc_price: Math.abs(parseAmount(btcRow["Fill Price"])),
      btc_amount: Number(btcAmount.toFixed(2)),
      btc_leg_label: shortLeg(String(btcRow.Symbol || "").trim()),
      sto_symbol: String(stoRow.Symbol || "").trim(),
      sto_expiry: isoDate(stoParsed.expiry),
      sto_strike: stoParsed.strike,
      sto_opt_type: stoParsed.option_type,
      sto_price: Math.abs(parseAmount(stoRow["Fill Price"])),
      sto_amount: Number(stoAmount.toFixed(2)),
      sto_leg_label: shortLeg(String(stoRow.Symbol || "").trim()),
      contracts,
      net_credit: Number(netCredit.toFixed(2)),
      combo_fees: Number(comboFees.toFixed(2)),
      strike_delta: Number(strikeDelta.toFixed(3)),
      expiry_delta: expiryDelta,
      combo_date: isoDate(comboTime),
      expiry: isoDate(stoParsed.expiry),
    });

    skipIdx.add(i);
    skipIdx.add(i + 1);
    skipIdx.add(i + 2);
  }

  const singleTrades = [];

  for (let i = 0; i < rows.length; i += 1) {
    if (skipIdx.has(i)) continue;

    const row = rows[i] || {};
    const symbol = String(row.Symbol || "").trim();
    const side = String(row.Side || "").trim();
    const status = String(row.Status || "").trim();

    if (status === "Cancelled" || symbol.includes("/")) continue;

    const parsed = parseSymbol(symbol);
    if (!parsed) continue;

    const fillTimeStr = String(row["Fill Time"] || "").trim();
    const fillQtyStr = String(row["Fill Qty"] || "").trim();
    const fillPriceStr = String(row["Fill Price"] || "").trim();
    const fillAmountStr = String(row["Fill Amount"] || "").trim();
    const orderSource = String(row["Order Source"] || "").trim();
    const feesStr = String(row.Total || "").trim();

    if (!fillTimeStr) continue;

    const fillTime = parseDt(fillTimeStr);
    const fillQty = fillQtyStr ? Math.abs(Number(fillQtyStr.replace(/,/g, ""))) : 0;
    const fillPrice = Math.abs(parseAmount(fillPriceStr));
    const fillAmount = Math.abs(parseAmount(fillAmountStr));
    const fees = Math.abs(parseAmount(feesStr));

    if (!fillTime || fillQty === 0 || !Number.isFinite(fillQty)) continue;

    singleTrades.push({
      symbol,
      ticker: parsed.ticker,
      expiry: parsed.expiry,
      option_type: parsed.option_type,
      strike: parsed.strike,
      side,
      fill_qty: Math.trunc(fillQty),
      fill_price: fillPrice,
      fill_amount: fillAmount,
      fill_time: fillTime,
      fees,
      order_source: orderSource,
    });
  }

  const bySymbol = new Map();
  singleTrades.forEach((trade) => {
    const list = bySymbol.get(trade.symbol) || [];
    list.push(trade);
    bySymbol.set(trade.symbol, list);
  });

  const positions = [];

  bySymbol.forEach((symTrades, symbol) => {
    const opens = symTrades.filter((t) => t.side === "Short Sell").sort((a, b) => a.fill_time - b.fill_time);
    const closes = symTrades.filter((t) => t.side !== "Short Sell").sort((a, b) => a.fill_time - b.fill_time);

    const used = new Set();

    opens.forEach((sell) => {
      let closeTrade = null;
      for (let i = 0; i < closes.length; i += 1) {
        if (used.has(i)) continue;
        if (closes[i].fill_time >= sell.fill_time) {
          closeTrade = closes[i];
          used.add(i);
          break;
        }
      }

      const credit = sell.fill_amount;
      const openDate = new Date(sell.fill_time.getFullYear(), sell.fill_time.getMonth(), sell.fill_time.getDate());
      const openFees = sell.fees;

      let isExpired = false;
      let isAssigned = false;
      let closePrice = 0;
      let closeAmount = 0;
      let closeFees = 0;
      let closeDate = null;
      let statusLabel = "OPEN";

      if (closeTrade) {
        const src = String(closeTrade.order_source || "");
        isExpired = src.includes("Expired");
        isAssigned = src.includes("Assigned");
        closePrice = closeTrade.fill_price;
        closeAmount = closeTrade.fill_amount;
        closeFees = closeTrade.fees;
        closeDate = new Date(closeTrade.fill_time.getFullYear(), closeTrade.fill_time.getMonth(), closeTrade.fill_time.getDate());

        if (isExpired) statusLabel = "EXPIRED";
        else if (isAssigned) statusLabel = "ASSIGNED";
        else if (closePrice === 0) statusLabel = "EXPIRED";
        else statusLabel = `$${closePrice.toFixed(2)}`;
      }

      const daysHeld = closeDate ? Math.round((closeDate - openDate) / 86400000) : 0;
      const totalFees = openFees + (closeTrade ? closeFees : 0);
      const netCredit = credit - closeAmount - totalFees;
      const investment = sell.strike * 100 * sell.fill_qty;
      const strategy = sell.option_type === "C" ? "CC" : "CSP";
      const premRoi = investment > 0 ? (netCredit / investment) * 100 : 0;
      const annRoi = daysHeld > 0 ? (premRoi / Math.max(daysHeld, 1)) * 365 : 0;

      positions.push({
        row_type: "position",
        symbol,
        ticker: sell.ticker,
        strike: sell.strike,
        option_type: sell.option_type,
        strategy,
        expiry: isoDate(sell.expiry),
        open_date: isoDate(openDate),
        close_date: closeDate ? isoDate(closeDate) : null,
        contracts: sell.fill_qty,
        credit: Number(credit.toFixed(2)),
        per_contract: Number(sell.fill_price.toFixed(4)),
        close_price: Number(closePrice.toFixed(4)),
        close_amount: Number(closeAmount.toFixed(2)),
        status: statusLabel,
        net_credit: Number(netCredit.toFixed(2)),
        days_held: daysHeld,
        investment: Number(investment.toFixed(2)),
        prem_roi: Number(premRoi.toFixed(4)),
        ann_roi: Number(annRoi.toFixed(2)),
        total_fees: Number(totalFees.toFixed(2)),
        is_expired: isExpired,
        is_assigned: isAssigned,
      });
    });
  });

  const expPositions = new Map();
  positions.forEach((p) => {
    const list = expPositions.get(p.expiry) || [];
    list.push(p);
    expPositions.set(p.expiry, list);
  });

  const expCombos = new Map();
  comboTrades.forEach((c) => {
    const list = expCombos.get(c.expiry) || [];
    list.push(c);
    expCombos.set(c.expiry, list);
  });

  const allExpiries = new Set([...expPositions.keys(), ...expCombos.keys()]);
  const weekly = {};

  [...allExpiries]
    .sort((a, b) => b.localeCompare(a))
    .forEach((expKey) => {
      const posList = expPositions.get(expKey) || [];
      const comboList = expCombos.get(expKey) || [];
      const closed = posList.filter((p) => p.status !== "OPEN");
      const expDt = fromIsoDate(expKey);
      if (!expDt) return;

      const posCredits = closed.reduce((sum, p) => sum + p.credit, 0);
      const posNet = closed.reduce((sum, p) => sum + p.net_credit, 0);
      const posFees = closed.reduce((sum, p) => sum + p.total_fees, 0);
      const posInvestment = closed.reduce((sum, p) => sum + p.investment, 0);
      const posContracts = closed.reduce((sum, p) => sum + p.contracts, 0);

      const comboSto = comboList.reduce((sum, c) => sum + c.sto_amount, 0);
      const comboBtc = comboList.reduce((sum, c) => sum + c.btc_amount, 0);
      const comboFees = comboList.reduce((sum, c) => sum + c.combo_fees, 0);
      const comboNet = comboList.reduce((sum, c) => sum + c.net_credit, 0);
      const comboContr = comboList.reduce((sum, c) => sum + c.contracts, 0);

      const totalNet = posNet + comboNet;
      const roi = posInvestment > 0 ? (totalNet / posInvestment) * 100 : 0;

      const allTradeDates = [
        ...closed.map((p) => p.open_date),
        ...comboList.map((c) => c.combo_date),
      ]
        .filter(Boolean)
        .sort();

      const uniqueTradeDates = [...new Set(allTradeDates)];
      let tradeDateRange = `${MONTHS[expDt.getMonth()]} ${expDt.getDate()}`;

      if (uniqueTradeDates.length > 0) {
        const fmtTrade = (iso) => {
          const dt = fromIsoDate(iso);
          return dt ? `${MONTHS[dt.getMonth()]} ${dt.getDate()}` : iso;
        };
        const first = fmtTrade(uniqueTradeDates[0]);
        const last = fmtTrade(uniqueTradeDates[uniqueTradeDates.length - 1]);
        tradeDateRange = first === last ? first : `${first} - ${last}`;
      }

      weekly[expKey] = {
        expiry_date: expKey,
        expiry_label: expDt.toLocaleDateString("en-US", {
          month: "long",
          day: "2-digit",
          year: "numeric",
        }),
        week_number: getIsoWeekNumber(expDt),
        trade_date_range: tradeDateRange,
        positions: closed.sort((a, b) => a.open_date.localeCompare(b.open_date)),
        pos_contracts: posContracts,
        pos_credits: Number(posCredits.toFixed(2)),
        pos_fees: Number(posFees.toFixed(2)),
        pos_net_credits: Number(posNet.toFixed(2)),
        pos_investment: Number(posInvestment.toFixed(2)),
        combos: comboList.sort((a, b) => {
          if (a.ticker === b.ticker) return a.combo_date.localeCompare(b.combo_date);
          return a.ticker.localeCompare(b.ticker);
        }),
        combo_contracts: comboContr,
        combo_sto: Number(comboSto.toFixed(2)),
        combo_btc: Number(comboBtc.toFixed(2)),
        combo_fees: Number(comboFees.toFixed(2)),
        combo_net: Number(comboNet.toFixed(2)),
        total_contracts: posContracts + comboContr,
        total_net_credits: Number(totalNet.toFixed(2)),
        total_investment: Number(posInvestment.toFixed(2)),
        roi: Number(roi.toFixed(4)),
      };
    });

  return weekly;
}

function processCsv(csvContent) {
  const rows = Papa.parse(csvContent, { header: true, skipEmptyLines: true }).data;
  return processRows(rows);
}

function summarize(weekly) {
  const values = Object.values(weekly || {});
  const allPos = values.flatMap((w) => w.positions || []);
  const allCombos = values.flatMap((w) => w.combos || []);

  const posGross = allPos.reduce((sum, p) => sum + (p.credit || 0), 0);
  const posFees = allPos.reduce((sum, p) => sum + (p.total_fees || 0), 0);
  const posNet = allPos.reduce((sum, p) => sum + (p.net_credit || 0), 0);
  const comboNet = allCombos.reduce((sum, c) => sum + (c.net_credit || 0), 0);

  return {
    total_weeks: values.length,
    pos_gross: Number(posGross.toFixed(2)),
    pos_fees: Number(posFees.toFixed(2)),
    pos_net: Number(posNet.toFixed(2)),
    combo_net: Number(comboNet.toFixed(2)),
    total_net: Number((posNet + comboNet).toFixed(2)),
    total_trades: allPos.length + allCombos.length,
  };
}

function money(n) {
  return currencyFmt.format(Number(n || 0));
}

function pct(n) {
  return `${Number(n || 0).toFixed(2)}%`;
}

export default function OptPilotDashboard() {
  const { ready, user, selectedUserKey, setSelectedUserKey, openDialog } = useOptPilotAuth();
  const [weekly, setWeekly] = useState({});
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [error, setError] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const weeks = useMemo(() => Object.values(weekly).sort((a, b) => b.expiry_date.localeCompare(a.expiry_date)), [weekly]);
  const selectedWeek = selectedExpiry ? weekly[selectedExpiry] : null;
  const summary = useMemo(() => summarize(weekly), [weekly]);

  async function loadUserTrades(userKey) {
    setLoading(true);
    setError("");

    try {
      const payload = await loadOptpilotTradeRows(userKey);
      const rows = payload.rows || [];

      if (!rows.length) {
        throw new Error("No trade rows found in Firestore for selected user");
      }

      const parsedWeekly = processRows(rows);
      const keys = Object.keys(parsedWeekly).sort((a, b) => b.localeCompare(a));
      if (keys.length === 0) {
        throw new Error("No valid weekly option data found in Firestore rows");
      }

      setWeekly(parsedWeekly);
      setSelectedExpiry(keys[0]);
      const uid = payload.authUid || resolveOptpilotUserId(userKey);
      const authMode = payload.authEnabled ? "firebase-auth" : "auth-disabled";
      setSourceInfo(`User ${userKey} (${uid}) via ${payload.sourcePath} [${authMode}]`);
    } catch (e) {
      setWeekly({});
      setSelectedExpiry("");
      setSourceInfo("");
      const message = e?.message || "Unknown error";
      setError(`Failed to load Firestore data: ${message}`);
      if (/authentication required|sign-in|login|signed-in user does not match/i.test(message)) {
        openDialog();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setWeekly({});
      setSelectedExpiry("");
      setSourceInfo("");
      return;
    }
    loadUserTrades(selectedUserKey);
  }, [ready, user, selectedUserKey]);

  return (
    <div className="optpilot-page">
      <div className="optpilot-header">
        <div>
          <h1 className="optpilot-title">OptPilot Weekly Options Expiry Dashboard v1.2</h1>
          <p className="optpilot-subtitle">Firestore source: Optpilot Portfolio.Trades (login required)</p>
        </div>
      </div>

      <div className="optpilot-controls">
        <div className="optpilot-user-tabs">
          {USER_KEYS.map((userKey) => (
            <button
              key={userKey}
              type="button"
              className={`optpilot-user-btn${selectedUserKey === userKey ? " active" : ""}`}
              onClick={() => setSelectedUserKey(userKey)}
              disabled={loading}
            >
              Test User {userKey}
            </button>
          ))}
        </div>
        <button type="button" className="optpilot-upload-btn" onClick={() => (user ? loadUserTrades(selectedUserKey) : openDialog())} disabled={loading || !ready}>
          {loading ? "Loading..." : user ? "Refresh Firestore" : "Login to Load"}
        </button>
      </div>

      {sourceInfo ? <div className="optpilot-file">Source: {sourceInfo}</div> : null}
      {error ? <div className="optpilot-error">{error}</div> : null}

      {weeks.length > 0 ? (
        <>
          <div className="optpilot-summary-grid">
            <div className="optpilot-kpi">
              <span>Weeks</span>
              <strong>{numberFmt.format(summary.total_weeks)}</strong>
            </div>
            <div className="optpilot-kpi">
              <span>Total Net</span>
              <strong>{money(summary.total_net)}</strong>
            </div>
            <div className="optpilot-kpi">
              <span>Position Net</span>
              <strong>{money(summary.pos_net)}</strong>
            </div>
            <div className="optpilot-kpi">
              <span>Combo Net</span>
              <strong>{money(summary.combo_net)}</strong>
            </div>
            <div className="optpilot-kpi">
              <span>Total Trades</span>
              <strong>{numberFmt.format(summary.total_trades)}</strong>
            </div>
          </div>

          <div className="optpilot-layout">
            <aside className="optpilot-sidebar">
              <h3>Expiry Weeks</h3>
              <div className="optpilot-weeks-list">
                {weeks.map((w) => (
                  <button
                    type="button"
                    key={w.expiry_date}
                    className={`optpilot-week-btn${selectedExpiry === w.expiry_date ? " active" : ""}`}
                    onClick={() => setSelectedExpiry(w.expiry_date)}
                  >
                    <div className="wk-label">{w.expiry_label}</div>
                    <div className="wk-meta">Week {w.week_number} | {w.trade_date_range}</div>
                    <div className="wk-net">Net: {money(w.total_net_credits)}</div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="optpilot-main">
              {selectedWeek ? (
                <>
                  <div className="optpilot-week-header">
                    <h2>{selectedWeek.expiry_label}</h2>
                    <div>
                      Contracts: {numberFmt.format(selectedWeek.total_contracts)} | ROI: {pct(selectedWeek.roi)}
                    </div>
                  </div>

                  <div className="optpilot-week-kpis">
                    <div className="optpilot-stat"><span>Position Credits</span><strong>{money(selectedWeek.pos_credits)}</strong></div>
                    <div className="optpilot-stat"><span>Position Fees</span><strong>{money(selectedWeek.pos_fees)}</strong></div>
                    <div className="optpilot-stat"><span>Position Net</span><strong>{money(selectedWeek.pos_net_credits)}</strong></div>
                    <div className="optpilot-stat"><span>Combo Net</span><strong>{money(selectedWeek.combo_net)}</strong></div>
                  </div>

                  <div className="optpilot-table-wrap">
                    <h3>Closed Positions</h3>
                    <table className="optpilot-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Symbol</th>
                          <th>Strat</th>
                          <th>Contracts</th>
                          <th>Open</th>
                          <th>Close</th>
                          <th>Status</th>
                          <th>Net</th>
                          <th>Prem ROI</th>
                          <th>Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWeek.positions.length ? (
                          selectedWeek.positions.map((p) => (
                            <tr key={`${p.symbol}-${p.open_date}-${p.status}`}>
                              <td>{p.ticker}</td>
                              <td>{p.symbol}</td>
                              <td>{p.strategy}</td>
                              <td>{numberFmt.format(p.contracts)}</td>
                              <td>{money(p.credit)}</td>
                              <td>{money(p.close_amount)}</td>
                              <td>{p.status}</td>
                              <td>{money(p.net_credit)}</td>
                              <td>{pct(p.prem_roi)}</td>
                              <td>{p.days_held}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={10}>No closed single-leg positions for this week.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="optpilot-table-wrap">
                    <h3>Combo Rolls</h3>
                    <table className="optpilot-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Strategy</th>
                          <th>Roll</th>
                          <th>BTC</th>
                          <th>STO</th>
                          <th>Contracts</th>
                          <th>Date</th>
                          <th>Net Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWeek.combos.length ? (
                          selectedWeek.combos.map((c) => (
                            <tr key={`${c.combo_symbol}-${c.combo_date}-${c.net_credit}`}>
                              <td>{c.ticker}</td>
                              <td>{c.strategy}</td>
                              <td>{c.roll_label}</td>
                              <td>{c.btc_leg_label}</td>
                              <td>{c.sto_leg_label}</td>
                              <td>{numberFmt.format(c.contracts)}</td>
                              <td>{c.combo_date}</td>
                              <td>{money(c.net_credit)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8}>No combo trades for this week.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          </div>
        </>
      ) : (
        <div className="optpilot-empty">
          {loading ? "Loading Firestore trades..." : user ? "No Firestore trade data yet for this user." : "Login on Home to unlock Portfolio.Trades."}
        </div>
      )}
    </div>
  );
}
