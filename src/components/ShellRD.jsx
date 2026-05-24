import { useEffect, useMemo, useState } from "react";
import { loadOptpilotTradeRows } from "../lib/optpilotFirestore.js";
import { useOptPilotAuth } from "../context/OptPilotAuthContext.jsx";

function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return sign * y;
}

function N(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bs(S, K, T, r, sig) {
  if (T <= 0) {
    return {
      call: Math.max(S - K, 0),
      delta: S > K ? 1 : 0,
      prob: S > K ? 1 : 0,
      theta: 0,
      vega: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);

  return {
    call: S * N(d1) - K * Math.exp(-r * T) * N(d2),
    delta: N(d1),
    prob: N(d2),
    theta: (-S * normPDF(d1) * sig / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N(d2)) / 365,
    vega: (S * normPDF(d1) * Math.sqrt(T)) / 100,
  };
}

const DEFAULT_SPOT = 39;
const DEFAULT_SHARES = 500;
const RFR = 0.035;
const ASSIGNMENT_PENALTY_PER_CONTRACT = 75;

const LADDER_SCENARIOS = [
  {
    id: "balanced",
    label: "Balanced Stagger",
    description: "Spread contracts across near and medium dates for smoother weekly management.",
    legs: [
      { id: "may", label: "May 15", days: 18, strike: 40 },
      { id: "jun", label: "Jun 19", days: 53, strike: 41 },
      { id: "jul", label: "Jul 17", days: 81, strike: 42 },
      { id: "sep", label: "Sep 18", days: 144, strike: 43 },
      { id: "nov", label: "Nov 21", days: 208, strike: 45 },
    ],
  },
  {
    id: "income",
    label: "Income Front-Loaded",
    description: "More short-dated calls to collect premium faster, with higher monitoring needed.",
    legs: [
      { id: "may", label: "May 15", days: 18, strike: 39.5 },
      { id: "jun", label: "Jun 19", days: 53, strike: 40.5 },
      { id: "aug", label: "Aug 21", days: 116, strike: 41.5 },
      { id: "oct", label: "Oct 16", days: 172, strike: 42.5 },
      { id: "nov", label: "Nov 21", days: 208, strike: 43.5 },
    ],
  },
  {
    id: "defensive",
    label: "Defensive Upside",
    description: "Higher strikes and wider spacing to keep more upside if Shell rallies strongly.",
    legs: [
      { id: "jun", label: "Jun 19", days: 53, strike: 41.5 },
      { id: "aug", label: "Aug 21", days: 116, strike: 42.5 },
      { id: "sep", label: "Sep 18", days: 144, strike: 43.5 },
      { id: "nov", label: "Nov 21", days: 208, strike: 45 },
      { id: "jan", label: "Jan 16", days: 264, strike: 46 },
    ],
  },
];

const OPTIMIZED_LADDER_TEMPLATE = {
  id: "optimized",
  label: "Max Risk-Adjusted",
  description: "Auto-picks strikes to maximize risk-adjusted net premium under the current IV and spot.",
  legs: [
    { id: "may", label: "May 15", days: 18 },
    { id: "jun", label: "Jun 19", days: 53 },
    { id: "aug", label: "Aug 21", days: 116 },
    { id: "oct", label: "Oct 16", days: 172 },
    { id: "jan", label: "Jan 16", days: 264 },
  ],
};

const MONTH_INDEX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const EXPIRY_TEMPLATES = [
  { month: 4, day: 15 },
  { month: 5, day: 19 },
  { month: 6, day: 17 },
  { month: 7, day: 21 },
  { month: 8, day: 18 },
  { month: 9, day: 16 },
  { month: 10, day: 21 },
  { month: 0, day: 16 },
];

function assignmentRiskLabel(probability) {
  if (probability >= 0.7) return "High";
  if (probability >= 0.4) return "Medium";
  return "Low";
}

function roundUpToHalf(value) {
  return Math.ceil(value * 2) / 2;
}

function EUR(n, dec = 2) {
  return `€${n.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

function canonicalText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFiniteNumber(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = asNumber(row?.[key], Number.NaN);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function buildContractLadder(totalShares, ladderSize) {
  const totalContracts = Math.max(0, Math.floor(Math.max(0, totalShares) / 100));
  const slots = Math.max(1, Math.trunc(ladderSize || 1));
  const baseContracts = Math.floor(totalContracts / slots);
  const remainder = totalContracts % slots;

  return {
    totalContracts,
    perExpiry: Array.from({ length: slots }, (_, idx) => baseContracts + (idx < remainder ? 1 : 0)),
  };
}

function parseStrikeValue(value) {
  const n = asNumber(value, Number.NaN);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n);
}

function isoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expiryLabelFromIso(iso) {
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[dt.getMonth()]} ${dt.getDate()}`;
}

function parseExpiryToken(token) {
  const m = String(token || "").trim().toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTH_INDEX[m[2]];
  const year = 2000 + Number(m[3]);
  if (!Number.isInteger(month)) return null;
  const dt = new Date(year, month, day);
  if (Number.isNaN(dt.getTime())) return null;
  return isoDate(dt);
}

function isShellTicker(value) {
  const ticker = canonicalText(value);
  return ticker.startsWith("shell");
}

function parseOptionSymbol(symbol) {
  const raw = String(symbol || "").trim().toUpperCase();
  const m = raw.match(/^([A-Z.]+)(\d{6})([CP])(\d+)$/);
  if (!m) return null;

  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const dt = new Date(2000 + yy, mm - 1, dd);
  if (Number.isNaN(dt.getTime())) return null;

  return {
    ticker: m[1],
    expiry: isoDate(dt),
    optionType: m[3],
    strike: Number(m[4]) / 1000,
  };
}

function normalizeExpiry(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const tokenParsed = parseExpiryToken(raw);
  if (tokenParsed) return tokenParsed;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return isoDate(dt);
}

function yearMonthDayFromIso(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
  };
}

function toDateFromIso(iso) {
  const parts = yearMonthDayFromIso(iso);
  if (!parts) return null;
  const dt = new Date(parts.year, parts.month, parts.day);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function rollCandidatesFromToday(today) {
  const baseYear = today.getFullYear();
  const candidates = [];

  [baseYear, baseYear + 1].forEach((year) => {
    EXPIRY_TEMPLATES.forEach((tpl) => {
      const dt = new Date(year, tpl.month, tpl.day);
      if (!Number.isNaN(dt.getTime()) && dt >= today) {
        candidates.push(isoDate(dt));
      }
    });
  });

  return [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
}

function parseQty(input) {
  const n = Number(String(input || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.abs(Math.trunc(n));
}

function parseMoney(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return Number.NaN;
  let normalized = raw.includes("(") && raw.includes(")")
    ? `-${raw.replace(/[()]/g, "")}`
    : raw;

  normalized = normalized.replace(/[^0-9,.-]/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const decimalDigits = normalized.length - lastComma - 1;
    if (decimalDigits >= 1 && decimalDigits <= 2) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else {
    normalized = normalized.replace(/,/g, "");
  }
  const n = Number(normalized.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function median(values) {
  const nums = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function estimatePlatformFeePerContract(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const feePerContractSamples = [];

  const explicitFeeKeys = ["Total", "total", "fees", "Fees", "fee", "Fee", "Commission", "commission"];
  const explicitQtyKeys = ["contracts", "Contracts", "Fill Qty", "fill_qty", "qty", "Qty", "quantity", "Quantity"];

  function keyWeight(key) {
    const k = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) return 0;
    if (k === "total" || k === "fees" || k === "fee" || k === "commission") return 5;
    if (k.includes("fees") || k.includes("commission")) return 4;
    if (k.includes("fee")) return 3;
    if (k.includes("total") && !k.includes("fillamount") && !k.includes("netamount")) return 2;
    return 0;
  }

  list.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const status = String(row.status || row.Status || "").trim().toLowerCase();
    if (status === "cancelled") return;

    const parsed = parseOptionSymbol(row.Symbol || row.symbol || "");
    const rowTicker = String(row.ticker || row.underlying || row.Underlying || row.Symbol || row.symbol || row.Name || row.name || "");
    const rowExpiry = normalizeExpiry(row.expiry || row.Expiry || "");
    const rowStrike = parseStrikeValue(row.strike ?? row.Strike);
    const rowOptionType = String(row.option_type || row.optionType || row.Type || "").trim().toUpperCase();
    const hasOptionShape = Boolean(parsed || rowExpiry || rowStrike || rowOptionType === "C" || rowOptionType === "P");
    const isShellRow = parsed ? isShellTicker(parsed.ticker) : isShellTicker(rowTicker);
    if (!hasOptionShape || !isShellRow) return;

    let contracts = 0;
    for (const key of explicitQtyKeys) {
      const qty = parseQty(row?.[key]);
      if (qty > 0) {
        contracts = qty;
        break;
      }
    }
    if (!contracts) {
      for (const [key, value] of Object.entries(row)) {
        const norm = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!norm.includes("qty") && !norm.includes("quantity") && !norm.includes("contract")) continue;
        const qty = parseQty(value);
        if (qty > 0) {
          contracts = qty;
          break;
        }
      }
    }
    if (!contracts) return;

    let feeAmount = Number.NaN;
    let bestWeight = 0;

    for (const key of explicitFeeKeys) {
      const parsedFee = parseMoney(row?.[key]);
      if (Number.isFinite(parsedFee) && parsedFee !== 0) {
        feeAmount = Math.abs(parsedFee);
        bestWeight = Math.max(bestWeight, keyWeight(key));
        break;
      }
    }

    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      for (const [key, value] of Object.entries(row)) {
        const weight = keyWeight(key);
        if (weight <= 0 || weight < bestWeight) continue;
        const parsedFee = parseMoney(value);
        if (!Number.isFinite(parsedFee) || parsedFee === 0) continue;
        feeAmount = Math.abs(parsedFee);
        bestWeight = weight;
      }
    }

    if (!Number.isFinite(feeAmount) || feeAmount <= 0) return;
    const perContract = feeAmount / contracts;
    if (!Number.isFinite(perContract) || perContract <= 0 || perContract > 50) return;
    feePerContractSamples.push(perContract);
  });

  return {
    perContract: median(feePerContractSamples),
    sampleCount: feePerContractSamples.length,
  };
}

function tradeDirection(row) {
  const action = String(row?.action || "").trim().toLowerCase();
  const side = String(row?.Side || row?.side || "").trim().toLowerCase();

  if (action === "sto" || action === "sell to open" || action === "short sell") return 1;
  if (action === "btc" || action === "buy to close") return -1;
  if (side.includes("short sell") || side.includes("sell to open") || side === "sto") return 1;
  if (side.includes("buy to close") || side === "btc") return -1;
  if (side === "sell" && !side.includes("close")) return 1;
  if (side === "buy" && side.includes("close")) return -1;

  return 0;
}

function parseTradeOptionLegs(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const netByKey = new Map();

  list.forEach((row) => {
    if (!row || typeof row !== "object") return;

    const status = String(row.status || row.Status || "").trim().toLowerCase();
    if (status === "cancelled") return;

    let leg = null;

    if (row.expiry && row.strike !== undefined && (row.option_type || row.optionType)) {
      const optionType = String(row.option_type || row.optionType || "").trim().toUpperCase();
      const ticker = String(row.ticker || row.underlying || row.symbol || "").trim().toUpperCase();
      const strike = parseStrikeValue(row.strike);
      const expiry = normalizeExpiry(row.expiry);
      if (!expiry || !strike || optionType !== "C" || !isShellTicker(ticker)) return;
      leg = { ticker, expiry, strike, optionType };
    } else {
      const parsed = parseOptionSymbol(row.Symbol || row.symbol || "");
      if (!parsed || parsed.optionType !== "C" || !isShellTicker(parsed.ticker)) return;
      leg = parsed;
    }

    const direction = tradeDirection(row);
    if (!direction) return;

    const contracts =
      parseQty(row.contracts) ||
      parseQty(row["Fill Qty"]) ||
      parseQty(row.fill_qty) ||
      1;

    const key = `${leg.ticker}|${leg.expiry}|${leg.strike}|${leg.optionType}`;
    const current = netByKey.get(key) || { ...leg, contracts: 0 };
    current.contracts += direction * contracts;
    netByKey.set(key, current);
  });

  return [...netByKey.values()]
    .filter((leg) => leg.contracts > 0)
    .sort((a, b) => {
      if (a.expiry === b.expiry) return a.strike - b.strike;
      return a.expiry.localeCompare(b.expiry);
    });
}

function firstFiniteNumberInRows(rows, keys, fallback = 0) {
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const n = firstFiniteNumber(row, keys, Number.NaN);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export default function ShellRD() {
  const { ready, user, openDialog } = useOptPilotAuth();
  const [iv, setIv] = useState(0.22);
  const [useRiskAdjusted, setUseRiskAdjusted] = useState(false);
  const [spot, setSpot] = useState(DEFAULT_SPOT);
  const [shares, setShares] = useState(DEFAULT_SHARES);
  const [tradeLegs, setTradeLegs] = useState([]);
  const [sourceInfo, setSourceInfo] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState({ perContract: 0, sampleCount: 0 });
  const [ladderScenarioId, setLadderScenarioId] = useState(OPTIMIZED_LADDER_TEMPLATE.id);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setSpot(DEFAULT_SPOT);
      setShares(DEFAULT_SHARES);
      setTradeLegs([]);
      setSourceInfo("");
      setLoadError("");
      setFeeEstimate({ perContract: 0, sampleCount: 0 });
      return;
    }

    let cancelled = false;

    async function loadShellTrades() {
      setLoading(true);
      setLoadError("");

      try {
        const tradesPayload = await loadOptpilotTradeRows({ uid: user?.uid });
        if (cancelled) return;

        const parsedTradeLegs = parseTradeOptionLegs(tradesPayload.rows || []);
        const feePerContract = estimatePlatformFeePerContract(tradesPayload.rows || []);
        const tradesSpot = firstFiniteNumberInRows(tradesPayload.rows || [], [
          "underlying_price",
          "underlyingPrice",
          "spot",
          "price",
          "last",
          "last_price",
        ], DEFAULT_SPOT);
        const sharesFromTradesRows = Math.max(0, Math.trunc(firstFiniteNumberInRows(tradesPayload.rows || [], [
          "shares",
          "quantity",
          "qty",
          "units",
          "holding",
          "position",
          "amount",
        ], 0)));
        const sharesFromLegs = parsedTradeLegs.reduce((sum, leg) => sum + Number(leg.contracts || 0), 0) * 100;
        const resolvedShares = Math.max(sharesFromTradesRows, sharesFromLegs, DEFAULT_SHARES);

        setShares(resolvedShares);
        setSpot(tradesSpot);
        setTradeLegs(parsedTradeLegs);
        setFeeEstimate(feePerContract);
        setSourceInfo(`${tradesPayload.authLogin || user?.email || user?.uid || "signed-in user"} via ${tradesPayload.sourcePath} (Portfolio.Trades only)`);
        if (!parsedTradeLegs.length) {
          setLoadError("No open Shell call legs found in Portfolio.Trades. Showing fallback ladder.");
        } else {
          setLoadError("");
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load trades";
        setSpot(DEFAULT_SPOT);
        setShares(DEFAULT_SHARES);
        setTradeLegs([]);
        setSourceInfo("");
        setLoadError(message);
        setFeeEstimate({ perContract: 0, sampleCount: 0 });
        if (/authentication required|sign-in|login|signed-in user does not match/i.test(message)) {
          openDialog();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadShellTrades();

    return () => {
      cancelled = true;
    };
  }, [ready, user, openDialog]);

  const optimizedScenario = useMemo(() => {
    const startStrike = roundUpToHalf(Math.max(spot, 1));
    const candidateStrikes = Array.from({ length: 21 }, (_, idx) => startStrike + idx * 0.5);

    const optimizedLegs = OPTIMIZED_LADDER_TEMPLATE.legs.map((leg) => {
      let best = null;

      candidateStrikes.forEach((strike) => {
        const model = bs(spot, strike, leg.days / 365, RFR, iv);
        const netPremiumPerContract = model.call * 100;
        const riskPenaltyPerContract = model.prob * ASSIGNMENT_PENALTY_PER_CONTRACT;
        const adjustedScorePerContract = netPremiumPerContract - riskPenaltyPerContract;

        if (!best || adjustedScorePerContract > best.adjustedScorePerContract) {
          best = {
            strike,
            adjustedScorePerContract,
            netPremiumPerContract,
            riskPenaltyPerContract,
          };
        }
      });

      return {
        ...leg,
        strike: best?.strike || startStrike,
        adjustedScorePerContract: best?.adjustedScorePerContract || 0,
        netPremiumPerContract: best?.netPremiumPerContract || 0,
        riskPenaltyPerContract: best?.riskPenaltyPerContract || 0,
      };
    });

    return {
      ...OPTIMIZED_LADDER_TEMPLATE,
      legs: optimizedLegs,
    };
  }, [iv, spot]);

  const ladderScenarioOptions = useMemo(
    () => [optimizedScenario, ...LADDER_SCENARIOS],
    [optimizedScenario],
  );

  const selectedLadderScenario = useMemo(
    () => ladderScenarioOptions.find((scenario) => scenario.id === ladderScenarioId) || ladderScenarioOptions[0],
    [ladderScenarioId, ladderScenarioOptions],
  );

  const fallbackLadder = useMemo(
    () => buildContractLadder(shares, selectedLadderScenario.legs.length),
    [shares, selectedLadderScenario],
  );
  const ladderContracts = fallbackLadder.perExpiry;
  const ladderTotalContracts = ladderContracts.reduce((sum, value) => sum + value, 0);
  const today = useMemo(() => new Date(), []);
  const activeLegs = tradeLegs;

  const rows = useMemo(() => {
    if (activeLegs.length) {
      return activeLegs.map((leg) => {
        const expiryDt = new Date(`${leg.expiry}T00:00:00`);
        const days = Math.max(1, Math.ceil((expiryDt.getTime() - today.getTime()) / 86400000));
        const T = Math.max(1 / 365, days / 365);
        const out = bs(spot, leg.strike, T, RFR, iv);
        const coveredShares = leg.contracts * 100;
        return {
          id: `${leg.expiry}-${leg.strike}-${leg.optionType}`,
          label: expiryLabelFromIso(leg.expiry),
          contractLabel: `${leg.ticker} ${leg.expiry} ${leg.strike.toFixed(0)} ${leg.optionType}`,
          strike: leg.strike,
          contracts: leg.contracts,
          coveredShares,
          premium: out.call * coveredShares,
          annualizedYield: (out.call / spot) * (365 / days) * 100,
          prob: out.prob,
        };
      });
    }

    return selectedLadderScenario.legs.map((exp, idx) => {
      const contracts = ladderContracts[idx] || 0;
      const coveredShares = contracts * 100;
      const strike = exp.strike;
      const out = bs(spot, strike, exp.days / 365, RFR, iv);
      const premium = out.call * coveredShares;
      const annualizedYield = (out.call / spot) * (365 / exp.days) * 100;
      return {
        id: `${selectedLadderScenario.id}-${exp.id}`,
        label: exp.label,
        contractLabel: `SHELL ${exp.label} ${strike.toFixed(0)} C`,
        contracts,
        coveredShares,
        strike,
        premium,
        annualizedYield,
        prob: out.prob,
      };
    });
  }, [activeLegs, iv, ladderContracts, selectedLadderScenario, spot, today]);

  const previewRows = useMemo(() => {
    return selectedLadderScenario.legs.map((exp, idx) => {
      const contracts = ladderContracts[idx] || 0;
      const coveredShares = contracts * 100;
      const strike = exp.strike;
      const out = bs(spot, strike, exp.days / 365, RFR, iv);
      return {
        id: `preview-${selectedLadderScenario.id}-${exp.id}`,
        label: exp.label,
        contractLabel: `SHELL ${exp.label} ${strike.toFixed(0)} C`,
        strike,
        contracts,
        coveredShares,
        premium: out.call * coveredShares,
        annualizedYield: (out.call / spot) * (365 / exp.days) * 100,
        prob: out.prob,
      };
    });
  }, [iv, ladderContracts, selectedLadderScenario, spot]);

  const selectedScenarioRiskAdjustedScore = useMemo(() => {
    const sourceRows = activeLegs.length ? previewRows : rows;
    return sourceRows.reduce((sum, row) => {
      const contracts = Number(row.contracts || 0);
      const riskPenalty = row.prob * ASSIGNMENT_PENALTY_PER_CONTRACT * contracts;
      return sum + row.premium - riskPenalty;
    }, 0);
  }, [activeLegs.length, previewRows, rows]);

  const totalPremium = rows.reduce((sum, r) => sum + r.premium, 0);
  const totalRowContracts = rows.reduce((sum, row) => sum + Number(row.contracts || 0), 0);
  const effectiveContracts = activeLegs.length ? totalRowContracts : ladderTotalContracts;
  const weightedAssignmentProb = effectiveContracts
    ? rows.reduce((sum, r) => sum + r.prob * Number(r.contracts || 0), 0) / effectiveContracts
    : 0;
  const avgAnnualizedYield = effectiveContracts
    ? rows.reduce((sum, r) => sum + r.annualizedYield * Number(r.contracts || 0), 0) / effectiveContracts
    : 0;
  const coverageDiffShares = shares - effectiveContracts * 100;
  const uncoveredShares = Math.max(0, coverageDiffShares);

  const rollRecommendations = useMemo(() => {
    if (!activeLegs.length) return [];

    const expiryUniverse = rollCandidatesFromToday(today);
    const strikeSteps = [0.5, 1, 2, 3, 4];

    function optionPrice(strike, expiryIso) {
      const expiryDate = toDateFromIso(expiryIso);
      if (!expiryDate) return null;
      const days = Math.max(1, Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000));
      const T = Math.max(1 / 365, days / 365);
      return {
        days,
        ...bs(spot, strike, T, RFR, iv),
      };
    }

    function pickBest(candidates) {
      if (!candidates.length) return null;
      return candidates.reduce((best, item) => {
        const bestScore = useRiskAdjusted ? best.adjustedScorePerContract : best.netCreditPerContract;
        const itemScore = useRiskAdjusted ? item.adjustedScorePerContract : item.netCreditPerContract;
        return itemScore > bestScore ? item : best;
      });
    }

    function buildCandidate(expiry, strike, next, currentModel) {
      const grossCreditPerContract = (next.call - currentModel.call) * 100;
      const estimatedRollFeePerContract = feeEstimate.sampleCount > 0 ? feeEstimate.perContract * 2 : 0;
      const netCreditPerContract = grossCreditPerContract - estimatedRollFeePerContract;
      const riskPenaltyPerContract = next.prob * ASSIGNMENT_PENALTY_PER_CONTRACT;
      return {
        expiry,
        strike,
        prob: next.prob,
        grossCreditPerContract,
        estimatedRollFeePerContract,
        netCreditPerContract,
        riskPenaltyPerContract,
        adjustedScorePerContract: netCreditPerContract - riskPenaltyPerContract,
      };
    }

    return activeLegs.map((leg) => {
      const currentModel = optionPrice(leg.strike, leg.expiry);
      if (!currentModel) return null;

      const outCandidates = expiryUniverse
        .filter((exp) => exp > leg.expiry)
        .map((exp) => {
          const next = optionPrice(leg.strike, exp);
          if (!next) return null;
          return buildCandidate(exp, leg.strike, next, currentModel);
        })
        .filter(Boolean);

      const upCandidates = expiryUniverse.flatMap((exp) => (
        strikeSteps.map((step) => {
          const nextStrike = leg.strike + step;
          const next = optionPrice(nextStrike, exp);
          if (!next) return null;
          return buildCandidate(exp, nextStrike, next, currentModel);
        })
      )).filter(Boolean);

      const downCandidates = expiryUniverse.flatMap((exp) => (
        strikeSteps.map((step) => {
          const nextStrike = leg.strike - step;
          if (nextStrike <= 0) return null;
          const next = optionPrice(nextStrike, exp);
          if (!next) return null;
          return buildCandidate(exp, nextStrike, next, currentModel);
        })
      )).filter(Boolean);

      const out = pickBest(outCandidates);
      const up = pickBest(upCandidates);
      const down = pickBest(downCandidates);

      return {
        key: `${leg.ticker}-${leg.expiry}-${leg.strike}`,
        leg,
        buybackPerContract: currentModel.call * 100,
        out,
        up,
        down,
      };
    }).filter(Boolean);
  }, [activeLegs, feeEstimate, iv, spot, today, useRiskAdjusted]);

  function renderRollChoice(choice, contracts, actionLabel) {
    if (!choice) return "-";

    const totalCredit = choice.netCreditPerContract * contracts;
    const totalAdjusted = choice.adjustedScorePerContract * contracts;

    return (
      <div style={{ display: "grid", gap: "2px" }}>
        <div style={{ fontWeight: 700 }}>
          {actionLabel}: move to {expiryLabelFromIso(choice.expiry)} at €{choice.strike.toFixed(2)}
        </div>
        <div>
          Extra premium now (after est. fees): {EUR(totalCredit)}
          {useRiskAdjusted ? ` (risk-adjusted: ${EUR(totalAdjusted)})` : ""}
        </div>
        <div style={{ color: "#6b5030" }}>
          Estimated roll fees: {feeEstimate.sampleCount > 0 ? EUR((choice.estimatedRollFeePerContract || 0) * contracts) : "Unavailable (no fee samples found)"}
        </div>
        <div style={{ color: "#6b5030" }}>
          Call-away chance: {(choice.prob * 100).toFixed(1)}% ({assignmentRiskLabel(choice.prob)})
        </div>
      </div>
    );
  }

  return (
    <div className="shellrd-root">
      <div className="shellrd-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <div className="serif" style={{ fontSize: "22px", letterSpacing: "-0.01em" }}>
              Shell RD Covered Call Strategy
            </div>
            <div className="sans" style={{ fontSize: "12px", color: "#a89060", marginTop: "4px" }}>
              Spot €{spot} · {shares} Shares · {effectiveContracts} Contract Ladder
            </div>
            {sourceInfo ? (
              <div className="sans" style={{ fontSize: "11px", color: "#bfa97f", marginTop: "6px" }}>
                {loading ? "Refreshing from portfolio.trades..." : sourceInfo}
              </div>
            ) : null}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: "10px", color: "#6b5030", marginBottom: "4px" }}>
              TOTAL PROJECTED PREMIUM
            </div>
            <div className="mono" style={{ fontSize: "26px", fontWeight: "500", color: "#fbbf24" }}>{EUR(totalPremium)}</div>
          </div>
        </div>
      </div>

      <div className="shellrd-body" style={{ padding: "20px 28px" }}>
        {loadError ? (
          <div className="warn-box" style={{ marginBottom: "14px" }}>
            {loadError}
          </div>
        ) : null}

        {!user ? (
          <div className="info-box" style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <span>Login to retrieve Shell option legs from Portfolio.Trades.</span>
            <button type="button" className="strike-btn sel" onClick={openDialog}>Login</button>
          </div>
        ) : null}

        {uncoveredShares > 0 ? (
          <div className="info-box" style={{ marginBottom: "14px" }}>
            {uncoveredShares} shares are currently uncovered (not enough for an additional full 100-share contract).
          </div>
        ) : null}

        <div className="card-section" style={{ marginBottom: "14px" }}>
          <div className="info-box" style={{ marginBottom: "12px" }}>
            <strong>How to read this:</strong> "Cash now" is option premium collected today. "Yield if repeated" annualizes this cycle's premium, and "Call-away chance" is the model's estimate your shares are sold at strike by expiry.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "8px", marginBottom: "10px" }}>
            <div className="card-section" style={{ padding: "10px" }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030" }}>Cash now (all calls)</div>
              <div className="mono" style={{ fontSize: "20px", color: "#8b6914" }}>{EUR(totalPremium)}</div>
            </div>
            <div className="card-section" style={{ padding: "10px" }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030" }}>Yield if repeated for 1 year</div>
              <div className="mono" style={{ fontSize: "20px", color: "#8b6914" }}>{avgAnnualizedYield.toFixed(1)}%</div>
            </div>
            <div className="card-section" style={{ padding: "10px" }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030" }}>Call-away chance (weighted)</div>
              <div className="mono" style={{ fontSize: "20px", color: "#8b6914" }}>
                {(weightedAssignmentProb * 100).toFixed(1)}% ({assignmentRiskLabel(weightedAssignmentProb)})
              </div>
            </div>
          </div>

          <div className="shellrd-ladder-selector" role="group" aria-label="Fallback ladder scenario selector">
            <div className="shellrd-ladder-selector-head">
              <span className="shellrd-ladder-selector-pill">
                {!activeLegs.length ? "Fallback ladder mode active" : "Fallback preview mode"}
              </span>
              <span className="shellrd-ladder-selector-title">Choose a fallback scenario</span>
            </div>
            <div className="shellrd-ladder-selector-subtitle">
              {!activeLegs.length
                ? "No open Shell call legs were found, so these buttons control the projected ladder shown below."
                : "Live rows stay from your open legs. The selected scenario is shown in the read-only preview table for side-by-side comparison."}
            </div>
            <div className="shellrd-ladder-selector-buttons">
              {ladderScenarioOptions.map((scenario) => (
                <button
                  type="button"
                  key={scenario.id}
                  className={`shellrd-ladder-btn${ladderScenarioId === scenario.id ? " active" : ""}`}
                  onClick={() => setLadderScenarioId(scenario.id)}
                  aria-pressed={ladderScenarioId === scenario.id}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
            <div className="shellrd-ladder-selector-note">
              {selectedLadderScenario.description}
              {" "}
              Estimated risk-adjusted net premium: {EUR(selectedScenarioRiskAdjustedScore)}.
            </div>
          </div>

          <label htmlFor="iv" style={{ display: "block", marginBottom: "8px", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            Implied Volatility: {(iv * 100).toFixed(1)}%
          </label>
          <input
            id="iv"
            type="range"
            min="0.12"
            max="0.5"
            step="0.01"
            value={iv}
            onChange={(e) => setIv(Number(e.target.value))}
          />
        </div>

        <div className="card-section" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Expiry</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Contract</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Strike</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Contracts</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Cash now</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Yield if repeated</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Call-away chance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.label}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.contractLabel}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>€{r.strike.toFixed(2)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.contracts}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{EUR(r.premium)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.annualizedYield.toFixed(1)}%</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>
                    {(r.prob * 100).toFixed(1)}% ({assignmentRiskLabel(r.prob)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activeLegs.length ? (
          <div className="card-section" style={{ marginTop: "14px", overflowX: "auto" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>
              Fallback scenario preview (read-only)
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030", marginBottom: "8px" }}>
              This table does not replace your live positions. It is only for comparing the selected fallback ladder against current legs.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px" }}>Expiry</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Contract</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Strike</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Contracts</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Cash now</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Yield if repeated</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Call-away chance</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id} className="row-hover">
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.label}</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.contractLabel}</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>€{r.strike.toFixed(2)}</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.contracts}</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{EUR(r.premium)}</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.annualizedYield.toFixed(1)}%</td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>
                      {(r.prob * 100).toFixed(1)}% ({assignmentRiskLabel(r.prob)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="card-section" style={{ marginTop: "14px", overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 700 }}>
              Simple roll ideas ({useRiskAdjusted ? "ranked by risk-adjusted value" : "ranked by extra premium"})
            </div>
            <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={useRiskAdjusted}
                onChange={(e) => setUseRiskAdjusted(e.target.checked)}
              />
              Use safer ranking (risk-adjusted)
            </label>
          </div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030", marginBottom: "8px" }}>
            Think of this as 3 choices for each current call: move expiry later, move strike up, or move strike down.
          </div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030", marginBottom: "8px" }}>
            {feeEstimate.sampleCount > 0
              ? `Fee assumption from Portfolio.Trades: ${EUR(feeEstimate.perContract)} per contract per order from ${feeEstimate.sampleCount} fee samples. Roll estimates subtract BTC + STO fees.`
              : "Fee assumption from Portfolio.Trades is unavailable (no fee samples found), so roll fee deduction is currently not applied."}
          </div>
          {useRiskAdjusted ? (
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "#6b5030", marginBottom: "8px" }}>
              Safer ranking score = extra premium - call-away risk penalty (€{ASSIGNMENT_PENALTY_PER_CONTRACT.toFixed(0)} per contract).
            </div>
          ) : null}
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Current call</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Contracts</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Cost to close now</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Move expiry later</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Move strike up (more upside)</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Move strike down (more income)</th>
              </tr>
            </thead>
            <tbody>
              {rollRecommendations.length ? rollRecommendations.map((r) => (
                <tr key={r.key} className="row-hover">
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>
                    {r.leg.ticker} {expiryLabelFromIso(r.leg.expiry)} €{r.leg.strike.toFixed(2)} call
                  </td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.leg.contracts}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{EUR(r.buybackPerContract * r.leg.contracts)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{renderRollChoice(r.out, r.leg.contracts, "Later expiry")}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{renderRollChoice(r.up, r.leg.contracts, "Higher strike")}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{renderRollChoice(r.down, r.leg.contracts, "Lower strike")}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>
                    No open call positions found yet, so roll ideas are not available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
