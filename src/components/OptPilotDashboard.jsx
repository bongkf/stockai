import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { loadOptpilotTradeRows } from "../lib/optpilotFirestore.js";
import { useOptPilotAuth } from "../context/OptPilotAuthContext.jsx";

const OCC_RE = /^([A-Z]+)(\d{6})([CP])(\d+)$/;
const COMBO_HDR_RE = /^([A-Z]+)\d{6}[CP]\d+\/[A-Z]*\d{6}[CP]\d+$/;
const COMBO_NAME_RE = /\b(combo|custom|calendar|calender|vertical|diagonal|spread)\b/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const numberFmt = new Intl.NumberFormat("en-US");
const FX_CACHE = new Map();



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

function getCalendarWeekInfo(d) {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const year = target.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const dayOfYear = Math.floor((target - yearStart) / 86400000) + 1;
  const rawWeekNumber = Math.floor((dayOfYear + yearStart.getDay()) / 7);
  const weekNumber = Math.max(1, rawWeekNumber);

  const weekStart = new Date(target);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (dt) => `${dt.getDate()}-${MONTHS[dt.getMonth()]}`;
  return {
    weekNumber,
    year,
    weekStartIso: isoDate(weekStart),
    weekEndIso: isoDate(weekEnd),
    rangeLabel: `${fmt(weekStart)} to ${fmt(weekEnd)}`,
  };
}

function weekKeyFromIso(iso) {
  const dt = fromIsoDate(normalizeIsoDay(iso || ""));
  if (!dt) return "";
  const weekStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return isoDate(weekStart);
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

function isBuySide(side) {
  const value = String(side || "").trim().toLowerCase();
  return value === "buy" || value.includes("buy to") || value === "btc" || value === "bto";
}

function isSellSide(side) {
  const value = String(side || "").trim().toLowerCase();
  return value === "sell" || value.includes("sell to") || value === "sto" || value === "stc";
}

function isComboHeader(symbol, name) {
  const rawSymbol = String(symbol || "").trim();
  const compactSymbol = rawSymbol.replace(/\s+/g, "");
  const rawName = String(name || "").trim();

  if (!compactSymbol.includes("/")) return false;
  if (COMBO_HDR_RE.test(compactSymbol)) return true;

  return COMBO_NAME_RE.test(rawName);
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

function normalizeIsoDay(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = parseDt(raw);
  return dt ? isoDate(dt) : "";
}

async function fetchFxRateToUsd(currency, tradeDate, overrideRate) {
  const override = Number(overrideRate || 0);
  if (Number.isFinite(override) && override > 0) return override;

  const ccy = String(currency || "USD").toUpperCase();
  if (ccy === "USD") return 1;
  if (ccy !== "EUR") return 1;

  const day = normalizeIsoDay(tradeDate);
  const cacheKey = `EURUSD:${day || "spot"}`;
  if (FX_CACHE.has(cacheKey)) return FX_CACHE.get(cacheKey);

  try {
    const query = day ? `?date=${encodeURIComponent(day)}` : "";
    const response = await fetch(`/quote/${encodeURIComponent("EURUSD=X")}${query}`);
    if (response.ok) {
      const payload = await response.json();
      const px = Number(payload?.price || 0);
      if (Number.isFinite(px) && px > 0) {
        FX_CACHE.set(cacheKey, px);
        return px;
      }
    }
  } catch {
    // Ignore and fall through to default.
  }

  FX_CACHE.set(cacheKey, 1);
  return 1;
}

async function enrichLegacyRowsWithFx(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  if (!rows.length || !hasLegacyPortfolioShape(rows)) return rows;

  const enriched = await Promise.all(rows.map(async (row) => {
    if (!row || typeof row !== "object") return row;

    const currency = String(row.currency || "USD").toUpperCase();
    const tradeDate = row.open_date || row.close_date || row.opened_at || row.closed_at;
    const fx = await fetchFxRateToUsd(currency, tradeDate, row.fx_rate_override);

    return {
      ...row,
      fx_rate_to_usd: fx,
    };
  }));

  return enriched;
}

function hasLegacyPortfolioShape(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : []).some((row) => {
    const item = row || {};
    return item && typeof item === "object" && item.chain_id && item.action && Number.isFinite(Number(item.premium_per_contract));
  });
}

function asLegacyDateLabel(iso) {
  const dt = fromIsoDate(iso);
  return dt ? `${MONTHS[dt.getMonth()]} ${dt.getDate()}` : String(iso || "");
}

function asLegacyLegLabel(row) {
  const strike = Number(row?.strike || 0);
  const strikeStr = Number.isInteger(strike) ? `$${strike}` : `$${strike.toFixed(2)}`;
  return `${asLegacyDateLabel(String(row?.expiry || ""))} ${strikeStr}${String(row?.option_type || "").toUpperCase()}`.trim();
}

function classifyLegacyRoll(btcRow, stoRow) {
  const btcStrike = Number(btcRow?.strike || 0);
  const stoStrike = Number(stoRow?.strike || 0);
  const sameStrike = Math.abs(btcStrike - stoStrike) < 0.001;
  const btcExp = String(btcRow?.expiry || "");
  const stoExp = String(stoRow?.expiry || "");
  const sameExpiry = btcExp && stoExp && btcExp === stoExp;
  const optionType = String(stoRow?.option_type || btcRow?.option_type || "P").toUpperCase();

  const expiryDir = !sameExpiry ? (stoExp > btcExp ? "Out" : "In") : "";
  let strikeDir = "";

  if (!sameStrike) {
    if (optionType === "P") {
      strikeDir = stoStrike < btcStrike ? "Down" : "Up";
    } else {
      strikeDir = stoStrike > btcStrike ? "Up" : "Down";
    }
  }

  if (sameStrike && !sameExpiry) return `Calendar Roll ${expiryDir}`.trim();
  if (sameExpiry && !sameStrike) return `Roll ${strikeDir}`.trim();
  if (!sameStrike && !sameExpiry) return `Roll ${strikeDir} & ${expiryDir}`.trim();
  return "Roll (Same)";
}

function weeklyInventory(posList, comboList) {
  const open = posList.filter((p) => p.status === "OPEN").length;
  const assigned = posList.filter((p) => p.status === "ASSIGNED" || p.is_assigned).length;
  const expired = posList.filter((p) => p.status === "EXPIRED" || p.is_expired).length;
  const closed = posList.filter((p) => p.status !== "OPEN" && p.status !== "ASSIGNED" && p.status !== "EXPIRED").length;
  const rolled = (Array.isArray(comboList) ? comboList.length : 0);

  return {
    open,
    closed,
    assigned,
    expired,
    rolled,
  };
}

function legacyRowKey(row) {
  return String(row?.id || `${row?.chain_id || ""}|${row?.action || ""}|${row?.open_date || ""}|${row?.expiry || ""}|${row?.premium_per_contract || 0}`).trim();
}

function legacyRowNetUsd(row) {
  const action = String(row?.action || "").toUpperCase();
  const source = String(row?.source || "").trim().toLowerCase();
  const rawPremium = Number(row?.premium_per_contract || 0);
  let signedPremium = rawPremium;

  if (!(["moomoo", "ibkr"].includes(source))) {
    if (action === "BTC" || action === "BTO") {
      signedPremium = -Math.abs(rawPremium);
    } else if (action === "STO" || action === "STC") {
      signedPremium = Math.abs(rawPremium);
    }
  }

  const contracts = Math.max(1, Math.trunc(Math.abs(Number(row?.contracts || 1))));
  const fxRateToUsd = Number(row?.fx_rate_to_usd || row?.fx_rate_override || 1);
  const fx = Number.isFinite(fxRateToUsd) && fxRateToUsd > 0 ? fxRateToUsd : 1;
  let net = signedPremium * 100 * contracts * fx;

  net -= Math.abs(Number(row?.fees_total || 0)) * fx;
  net -= Math.abs(Number(row?.close_fees_total || 0)) * fx;

  const closeCost = row?.close_cost_per_contract;
  if (closeCost !== null && closeCost !== undefined && String(closeCost).trim() !== "" && (action === "STO" || action === "BTO") && !(["moomoo", "ibkr"].includes(source))) {
    net -= Number(closeCost || 0) * 100 * contracts * fx;
  }

  return net;
}

function processLegacyPortfolioRows(rawRows) {
  const rows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => row && typeof row === "object");
  const byChain = new Map();
  const rowsByWeek = new Map();

  rows.forEach((row) => {
    const chainId = String(row.chain_id || row.id || "").trim();
    if (!chainId) return;
    const list = byChain.get(chainId) || [];
    list.push(row);
    byChain.set(chainId, list);

    const tradeDateIso = normalizeIsoDay(row.open_date || row.opened_at || row.close_date || row.closed_at || row.expiry || "");
    const weekKey = weekKeyFromIso(tradeDateIso);
    if (weekKey) {
      const weekRows = rowsByWeek.get(weekKey) || [];
      weekRows.push(row);
      rowsByWeek.set(weekKey, weekRows);
    }
  });

  const positions = [];
  const comboTrades = [];
  const comboRowKeys = new Set();

  byChain.forEach((chainRows, chainId) => {
    const base = chainRows[0] || {};

    const ticker = String(base.ticker || "").trim();
    const expiryRaw = String(base.expiry || "").trim();
    const expiryDate = parseDt(expiryRaw) || fromIsoDate(expiryRaw);
    const expiry = expiryDate ? isoDate(expiryDate) : expiryRaw;
    if (!ticker || !expiry) return;

    const contracts = Math.max(1, ...chainRows.map((row) => Math.max(1, Math.trunc(Math.abs(Number(row.contracts || 1))))));
    const strike = Number(base.strike || 0);
    const optionType = String(base.option_type || "").toUpperCase() === "C" ? "C" : "P";
    const strategy = optionType === "C" ? "CC" : "CSP";

    const openDates = chainRows
      .map((row) => parseDt(row.open_date || row.opened_at || row.openedAt))
      .filter((d) => d instanceof Date);
    const openDate = openDates.length
      ? new Date(Math.min(...openDates.map((d) => d.getTime())))
      : (expiryDate || null);
    if (!openDate) return;

    const closeDateRaw = chainRows
      .map((row) => parseDt(row.close_date || row.closed_at || row.closedAt))
      .find((d) => d instanceof Date) || null;

    const statuses = chainRows.map((row) => String(row.status || "").toLowerCase());
    const isAssigned = statuses.some((status) => status.includes("assigned"));
    const isExpired = !isAssigned && statuses.some((status) => status.includes("expired"));
    const isClosed = !isAssigned && !isExpired && statuses.some((status) => status.includes("closed"));

    const closeDate = closeDateRaw || ((isAssigned || isExpired || isClosed) && expiryDate ? expiryDate : null);

    let statusLabel = "OPEN";
    if (isAssigned) statusLabel = "ASSIGNED";
    else if (isExpired) statusLabel = "EXPIRED";
    else if (isClosed) statusLabel = "CLOSED";

    let stoCredit = 0;
    let closeAmount = 0;
    let netPremium = 0;
    let totalFees = 0;

    chainRows.forEach((row) => {
      const action = String(row.action || "").toUpperCase();
      const rowContracts = Math.max(1, Math.trunc(Math.abs(Number(row.contracts || contracts || 1))));
      const premiumPerContract = Number(row.premium_per_contract || 0);
      const fxRateToUsd = Number(row.fx_rate_to_usd || row.fx_rate_override || 1);
      const fx = Number.isFinite(fxRateToUsd) && fxRateToUsd > 0 ? fxRateToUsd : 1;
      const premiumDollars = premiumPerContract * 100 * rowContracts * fx;
      netPremium += premiumDollars;

      if (action === "STO") {
        stoCredit += Math.max(premiumDollars, 0);
      } else if (action === "BTC") {
        closeAmount += Math.abs(premiumDollars);
      }

      const rowFees = (Number(row.fees_total || 0) + Number(row.close_fees_total || 0)) * fx;
      totalFees += Number.isFinite(rowFees) ? rowFees : 0;
    });

    const netCredit = netPremium - totalFees;
    const investment = Math.max(strike, 0) * 100 * contracts;
    const daysHeld = closeDate ? Math.max(0, Math.round((closeDate - openDate) / 86400000)) : 0;
    const premRoi = investment > 0 ? (netCredit / investment) * 100 : 0;
    const annRoi = daysHeld > 0 ? (premRoi / Math.max(daysHeld, 1)) * 365 : 0;

    positions.push({
      row_type: "position",
      symbol: String(base.ticker_name || chainId),
      ticker,
      strike: Number.isFinite(strike) ? strike : 0,
      option_type: optionType,
      strategy,
      expiry,
      open_date: isoDate(openDate),
      close_date: closeDate ? isoDate(closeDate) : null,
      contracts,
      credit: Number(stoCredit.toFixed(2)),
      per_contract: Number((stoCredit / Math.max(contracts * 100, 1)).toFixed(4)),
      close_price: Number((closeAmount / Math.max(contracts * 100, 1)).toFixed(4)),
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

  const usedStoIds = new Set();
  const rollOutRows = rows.filter((row) => String(row.action || "").toUpperCase() === "BTC" && row.rolled_to_chain_id);

  rollOutRows.forEach((btcRow) => {
    const fromChainId = String(btcRow.chain_id || "").trim();
    const toChainId = String(btcRow.rolled_to_chain_id || "").trim();
    if (!fromChainId || !toChainId) return;

    const candidates = rows.filter((row) => {
      if (String(row.action || "").toUpperCase() !== "STO") return false;
      if (String(row.chain_id || "").trim() !== toChainId) return false;
      const rolledFrom = String(row.rolled_from_chain_id || "").trim();
      return !rolledFrom || rolledFrom === fromChainId;
    });

    const stoRow = candidates.find((row) => !usedStoIds.has(String(row.id || row.chain_id || ""))) || candidates[0];
    if (!stoRow) return;

    const stoRowId = String(stoRow.id || stoRow.chain_id || "");
    if (stoRowId) usedStoIds.add(stoRowId);
    comboRowKeys.add(legacyRowKey(btcRow));
    comboRowKeys.add(legacyRowKey(stoRow));

    const btcContracts = Math.max(1, Math.trunc(Math.abs(Number(btcRow.contracts || 1))));
    const stoContracts = Math.max(1, Math.trunc(Math.abs(Number(stoRow.contracts || 1))));
    const contracts = Math.max(btcContracts, stoContracts);

    const btcFx = Number(btcRow.fx_rate_to_usd || btcRow.fx_rate_override || 1);
    const stoFx = Number(stoRow.fx_rate_to_usd || stoRow.fx_rate_override || 1);
    const btcRate = Number.isFinite(btcFx) && btcFx > 0 ? btcFx : 1;
    const stoRate = Number.isFinite(stoFx) && stoFx > 0 ? stoFx : 1;

    const btcAmount = Math.abs(Number(btcRow.premium_per_contract || 0) * 100 * btcContracts * btcRate);
    const stoAmount = Math.abs(Number(stoRow.premium_per_contract || 0) * 100 * stoContracts * stoRate);
    const comboFees =
      (Math.abs(Number(btcRow.fees_total || 0)) + Math.abs(Number(btcRow.close_fees_total || 0))) * btcRate +
      (Math.abs(Number(stoRow.fees_total || 0)) + Math.abs(Number(stoRow.close_fees_total || 0))) * stoRate;
    const netCredit = legacyRowNetUsd(stoRow) + legacyRowNetUsd(btcRow);

    const comboDateIso = normalizeIsoDay(stoRow.open_date || stoRow.opened_at || btcRow.open_date || btcRow.opened_at || "");
    const stoExpiry = normalizeIsoDay(stoRow.expiry || "");
    const btcExpiry = normalizeIsoDay(btcRow.expiry || "");

    comboTrades.push({
      row_type: "combo",
      combo_symbol: `${fromChainId}->${toChainId}`,
      ticker: String(stoRow.ticker || btcRow.ticker || "").trim(),
      strategy: String(stoRow.option_type || btcRow.option_type || "P").toUpperCase() === "C" ? "CC" : "CSP",
      roll_label: classifyLegacyRoll({ ...btcRow, expiry: btcExpiry }, { ...stoRow, expiry: stoExpiry }),
      is_calendar: normalizeIsoDay(stoRow.expiry || "") !== normalizeIsoDay(btcRow.expiry || "") && Math.abs(Number(stoRow.strike || 0) - Number(btcRow.strike || 0)) < 0.001,
      btc_symbol: String(btcRow.ticker_name || fromChainId),
      btc_expiry: btcExpiry,
      btc_strike: Number(btcRow.strike || 0),
      btc_opt_type: String(btcRow.option_type || "").toUpperCase(),
      btc_price: Math.abs(Number(btcRow.premium_per_contract || 0)),
      btc_amount: Number(btcAmount.toFixed(2)),
      btc_leg_label: asLegacyLegLabel(btcRow),
      sto_symbol: String(stoRow.ticker_name || toChainId),
      sto_expiry: stoExpiry,
      sto_strike: Number(stoRow.strike || 0),
      sto_opt_type: String(stoRow.option_type || "").toUpperCase(),
      sto_price: Math.abs(Number(stoRow.premium_per_contract || 0)),
      sto_amount: Number(stoAmount.toFixed(2)),
      sto_leg_label: asLegacyLegLabel(stoRow),
      contracts,
      net_credit: Number(netCredit.toFixed(2)),
      combo_fees: Number(comboFees.toFixed(2)),
      strike_delta: Number((Number(stoRow.strike || 0) - Number(btcRow.strike || 0)).toFixed(3)),
      expiry_delta: Math.round(((fromIsoDate(stoExpiry)?.getTime() || 0) - (fromIsoDate(btcExpiry)?.getTime() || 0)) / 86400000),
      combo_date: comboDateIso,
      expiry: stoExpiry,
    });
  });

  const weekPositions = new Map();
  positions.forEach((p) => {
    const weekKey = weekKeyFromIso(p.open_date || p.expiry);
    if (!weekKey) return;
    const list = weekPositions.get(weekKey) || [];
    list.push(p);
    weekPositions.set(weekKey, list);
  });

  const weekCombos = new Map();
  comboTrades.forEach((c) => {
    const weekKey = weekKeyFromIso(c.combo_date || c.expiry);
    if (!weekKey) return;
    const list = weekCombos.get(weekKey) || [];
    list.push(c);
    weekCombos.set(weekKey, list);
  });

  const allWeekKeys = new Set([...weekPositions.keys(), ...weekCombos.keys()]);
  const weekly = {};
  [...allWeekKeys]
    .sort((a, b) => b.localeCompare(a))
    .forEach((weekKey) => {
      const posList = weekPositions.get(weekKey) || [];
      const comboList = weekCombos.get(weekKey) || [];
      const weekRows = rowsByWeek.get(weekKey) || [];
      const nonComboRows = weekRows.filter((row) => !comboRowKeys.has(legacyRowKey(row)));
      const closed = posList.filter((p) => p.status !== "OPEN");
      const weekStartDt = fromIsoDate(weekKey);
      if (!weekStartDt) return;
      const calWeek = getCalendarWeekInfo(weekStartDt);

      const posCredits = nonComboRows
        .filter((row) => String(row.action || "").toUpperCase() === "STO")
        .reduce((sum, row) => {
          const contracts = Math.max(1, Math.trunc(Math.abs(Number(row.contracts || 1))));
          const fxRateToUsd = Number(row.fx_rate_to_usd || row.fx_rate_override || 1);
          const fx = Number.isFinite(fxRateToUsd) && fxRateToUsd > 0 ? fxRateToUsd : 1;
          const source = String(row.source || "").trim().toLowerCase();
          const rawPremium = Number(row.premium_per_contract || 0);
          const premium = ["moomoo", "ibkr"].includes(source) ? rawPremium : Math.abs(rawPremium);
          const gross = premium * 100 * contracts * fx;
          return sum + Math.max(gross, 0);
        }, 0);
      const posNet = nonComboRows.reduce((sum, row) => sum + legacyRowNetUsd(row), 0);
      const comboRows = weekRows.filter((row) => comboRowKeys.has(legacyRowKey(row)));
      const comboNet = comboRows.reduce((sum, row) => sum + legacyRowNetUsd(row), 0);
      const posFees = nonComboRows.reduce((sum, row) => {
        const fxRateToUsd = Number(row.fx_rate_to_usd || row.fx_rate_override || 1);
        const fx = Number.isFinite(fxRateToUsd) && fxRateToUsd > 0 ? fxRateToUsd : 1;
        return sum + (Math.abs(Number(row.fees_total || 0)) + Math.abs(Number(row.close_fees_total || 0))) * fx;
      }, 0);
      const posInvestment = posList.reduce((sum, p) => sum + p.investment, 0);
      const posContracts = posList.reduce((sum, p) => sum + p.contracts, 0);

      const tradeDateRange = calWeek.rangeLabel;

      const roi = posInvestment > 0 ? (posNet / posInvestment) * 100 : 0;
      const comboSto = comboList.reduce((sum, c) => sum + c.sto_amount, 0);
      const comboBtc = comboList.reduce((sum, c) => sum + c.btc_amount, 0);
      const comboFees = comboList.reduce((sum, c) => sum + c.combo_fees, 0);
      const comboContr = comboList.reduce((sum, c) => sum + c.contracts, 0);
      const totalNet = posNet + comboNet;
      const inventory = weeklyInventory(posList, comboList);
      const tradeCount = weekRows.length;

      weekly[weekKey] = {
        expiry_date: weekKey,
        expiry_label: `Week ${calWeek.weekNumber}, ${calWeek.year}`,
        week_number: calWeek.weekNumber,
        week_year: calWeek.year,
        week_start: calWeek.weekStartIso,
        week_end: calWeek.weekEndIso,
        week_range: calWeek.rangeLabel,
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
        inventory,
        trade_count: tradeCount,
      };
    });

  return weekly;
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

    const isCombo = isComboHeader(symbol, name);

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

    if (isBuySide(s1) && isSellSide(s2)) {
      btcRow = leg1;
      stoRow = leg2;
    } else if (isSellSide(s1) && isBuySide(s2)) {
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

    const isCalendar = /calendar|calender/i.test(name);
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

  const weekPositions = new Map();
  positions.forEach((p) => {
    const weekKey = weekKeyFromIso(p.open_date || p.expiry);
    if (!weekKey) return;
    const list = weekPositions.get(weekKey) || [];
    list.push(p);
    weekPositions.set(weekKey, list);
  });

  const weekCombos = new Map();
  comboTrades.forEach((c) => {
    const weekKey = weekKeyFromIso(c.combo_date || c.expiry);
    if (!weekKey) return;
    const list = weekCombos.get(weekKey) || [];
    list.push(c);
    weekCombos.set(weekKey, list);
  });

  const allWeekKeys = new Set([...weekPositions.keys(), ...weekCombos.keys()]);
  const weekly = {};

  [...allWeekKeys]
    .sort((a, b) => b.localeCompare(a))
    .forEach((weekKey) => {
      const posList = weekPositions.get(weekKey) || [];
      const comboList = weekCombos.get(weekKey) || [];
      const closed = posList.filter((p) => p.status !== "OPEN");
      const weekStartDt = fromIsoDate(weekKey);
      if (!weekStartDt) return;
      const calWeek = getCalendarWeekInfo(weekStartDt);

      const posCredits = posList.reduce((sum, p) => sum + p.credit, 0);
      const posNet = posList.reduce((sum, p) => sum + p.net_credit, 0);
      const posFees = posList.reduce((sum, p) => sum + p.total_fees, 0);
      const posInvestment = posList.reduce((sum, p) => sum + p.investment, 0);
      const posContracts = posList.reduce((sum, p) => sum + p.contracts, 0);

      const comboSto = comboList.reduce((sum, c) => sum + c.sto_amount, 0);
      const comboBtc = comboList.reduce((sum, c) => sum + c.btc_amount, 0);
      const comboFees = comboList.reduce((sum, c) => sum + c.combo_fees, 0);
      const comboNet = comboList.reduce((sum, c) => sum + c.net_credit, 0);
      const comboContr = comboList.reduce((sum, c) => sum + c.contracts, 0);
      const inventory = weeklyInventory(posList, comboList);
      const tradeCount = posList.length + comboList.length;

      const totalNet = posNet + comboNet;
      const roi = posInvestment > 0 ? (totalNet / posInvestment) * 100 : 0;

      const tradeDateRange = calWeek.rangeLabel;

      weekly[weekKey] = {
        expiry_date: weekKey,
        expiry_label: `Week ${calWeek.weekNumber}, ${calWeek.year}`,
        week_number: calWeek.weekNumber,
        week_year: calWeek.year,
        week_start: calWeek.weekStartIso,
        week_end: calWeek.weekEndIso,
        week_range: calWeek.rangeLabel,
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
        inventory,
        trade_count: tradeCount,
      };
    });

  const hasPrimaryData = Object.keys(weekly).length > 0;
  if (hasPrimaryData) return weekly;

  if (hasLegacyPortfolioShape(rawRows)) {
    return processLegacyPortfolioRows(rawRows);
  }

  return weekly;
}

function processCsv(csvContent) {
  const rows = Papa.parse(csvContent, { header: true, skipEmptyLines: true }).data;
  return processRows(rows);
}

function summarize(weekly) {
  const values = Object.values(weekly || {});
  const posGross = values.reduce((sum, w) => sum + Number(w.pos_credits || 0), 0);
  const posFees = values.reduce((sum, w) => sum + Number(w.pos_fees || 0), 0);
  const posNet = values.reduce((sum, w) => sum + Number(w.pos_net_credits || 0), 0);
  const comboNet = values.reduce((sum, w) => sum + Number(w.combo_net || 0), 0);
  const totalTrades = values.reduce((sum, w) => sum + Number(w.trade_count || 0), 0);

  return {
    total_weeks: values.length,
    pos_gross: Number(posGross.toFixed(2)),
    pos_fees: Number(posFees.toFixed(2)),
    pos_net: Number(posNet.toFixed(2)),
    combo_net: Number(comboNet.toFixed(2)),
    total_net: Number((posNet + comboNet).toFixed(2)),
    total_trades: totalTrades,
  };
}

function money(n) {
  return currencyFmt.format(Number(n || 0));
}

function pct(n) {
  return `${Number(n || 0).toFixed(2)}%`;
}

export default function OptPilotDashboard() {
  const { ready, user, openDialog } = useOptPilotAuth();
  const [weekly, setWeekly] = useState({});
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [error, setError] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showParityDiag, setShowParityDiag] = useState(import.meta.env.DEV);

  const weeks = useMemo(() => Object.values(weekly).sort((a, b) => b.expiry_date.localeCompare(a.expiry_date)), [weekly]);
  const selectedWeek = selectedExpiry ? weekly[selectedExpiry] : null;
  const summary = useMemo(() => summarize(weekly), [weekly]);

  async function loadUserTrades() {
    setLoading(true);
    setError("");

    try {
      const payload = await loadOptpilotTradeRows({
        uid: user?.uid,
      });
      const rows = payload.rows || [];

      if (!rows.length) {
        throw new Error("No trade rows found in Firestore for the signed-in user");
      }

      const fxRows = await enrichLegacyRowsWithFx(rows);
      const parsedWeekly = processRows(fxRows);
      const keys = Object.keys(parsedWeekly).sort((a, b) => b.localeCompare(a));
      if (keys.length === 0) {
        throw new Error("No valid weekly option data found in Firestore rows");
      }

      setWeekly(parsedWeekly);
      setSelectedExpiry(keys[0]);
      const uid = payload.authUid || user?.uid || "unknown-uid";
      const loginDetail = payload.authLogin || user?.email || user?.displayName || "signed-in user";
      const authMode = payload.authEnabled ? "firebase-auth" : "auth-disabled";
      setSourceInfo(`${loginDetail} (${uid}) via ${payload.sourcePath} [${authMode}]`);
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
    loadUserTrades();
  }, [ready, user]);

  return (
    <div className="optpilot-page">
      <div className="optpilot-topbar">
        <div className="optpilot-topbar-left">
          <span className="optpilot-title">OptPilot Weekly Dashboard</span>
          {sourceInfo ? <span className="optpilot-topbar-source">{sourceInfo}</span> : null}
        </div>
        <div className="optpilot-topbar-right">
          {import.meta.env.DEV && (
            <label className="optpilot-diag-toggle">
              <input
                type="checkbox"
                checked={showParityDiag}
                onChange={(e) => setShowParityDiag(e.target.checked)}
              />
              Parity Diag
            </label>
          )}
          <button type="button" className="optpilot-upload-btn" onClick={() => (user ? loadUserTrades() : openDialog())} disabled={loading || !ready}>
            {loading ? "Loading…" : user ? "Refresh" : "Login"}
          </button>
        </div>
      </div>

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

          {showParityDiag && (
            <details className="optpilot-parity-diag" style={{ margin: "8px 0 12px", fontSize: "0.75rem", color: "#888" }}>
              <summary style={{ cursor: "pointer", userSelect: "none", fontWeight: 600, color: "#f59e0b" }}>
                ⚙ Parity Diagnostics — {summary.total_trades} trades · {money(summary.total_net)} total net
              </summary>
              <div style={{ overflowX: "auto", marginTop: 6 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.72rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      <th style={{ textAlign: "left", padding: "2px 6px" }}>Week Start</th>
                      <th style={{ textAlign: "right", padding: "2px 6px" }}>Trades</th>
                      <th style={{ textAlign: "right", padding: "2px 6px" }}>Pos Net</th>
                      <th style={{ textAlign: "right", padding: "2px 6px" }}>Combo Net</th>
                      <th style={{ textAlign: "right", padding: "2px 6px" }}>Total Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.expiry_date} style={{ borderBottom: "1px solid #222" }}>
                        <td style={{ padding: "2px 6px" }}>{w.expiry_date}</td>
                        <td style={{ textAlign: "right", padding: "2px 6px" }}>{w.trade_count}</td>
                        <td style={{ textAlign: "right", padding: "2px 6px", color: w.pos_net_credits >= 0 ? "#4ade80" : "#f87171" }}>{money(w.pos_net_credits)}</td>
                        <td style={{ textAlign: "right", padding: "2px 6px", color: w.combo_net >= 0 ? "#4ade80" : "#f87171" }}>{money(w.combo_net)}</td>
                        <td style={{ textAlign: "right", padding: "2px 6px", fontWeight: 600, color: w.total_net_credits >= 0 ? "#4ade80" : "#f87171" }}>{money(w.total_net_credits)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #555", fontWeight: 700 }}>
                      <td style={{ padding: "3px 6px" }}>TOTAL</td>
                      <td style={{ textAlign: "right", padding: "3px 6px" }}>{summary.total_trades}</td>
                      <td style={{ textAlign: "right", padding: "3px 6px" }}>{money(summary.pos_net)}</td>
                      <td style={{ textAlign: "right", padding: "3px 6px" }}>{money(summary.combo_net)}</td>
                      <td style={{ textAlign: "right", padding: "3px 6px" }}>{money(summary.total_net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          )}

          <div className="optpilot-layout">
            <aside className="optpilot-sidebar">
              <h3>Transaction Weeks</h3>
              <div className="optpilot-weeks-list">
                {weeks.map((w) => (
                  <button
                    type="button"
                    key={w.expiry_date}
                    className={`optpilot-week-btn${selectedExpiry === w.expiry_date ? " active" : ""}`}
                    onClick={() => setSelectedExpiry(w.expiry_date)}
                  >
                    <div className="wk-head">
                      <div className="wk-label">{w.expiry_label}</div>
                      <div className={`wk-net-chip ${w.total_net_credits >= 0 ? "positive" : "negative"}`}>Net {money(w.total_net_credits)}</div>
                    </div>
                    <div className="wk-line2">
                      <div className="wk-meta">{w.week_range}</div>
                      <div className="wk-trades">{numberFmt.format(w.trade_count || 0)} trades</div>
                    </div>
                    <div className="wk-stats-inline">
                      Net {money(w.total_net_credits)} | Trades {numberFmt.format(w.trade_count || 0)} |
                      {" "}
                      O {numberFmt.format(w.inventory?.open || 0)} | C {numberFmt.format(w.inventory?.closed || 0)} | A {numberFmt.format(w.inventory?.assigned || 0)} | E {numberFmt.format(w.inventory?.expired || 0)} | R {numberFmt.format(w.inventory?.rolled || 0)}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="optpilot-main">
              {selectedWeek ? (
                <>
                  <div className="optpilot-week-header">
                    <h2>{selectedWeek.expiry_label}</h2>
                    <div className="optpilot-week-header-meta">
                      {selectedWeek.week_range} | Contracts: {numberFmt.format(selectedWeek.total_contracts)} | ROI: {pct(selectedWeek.roi)}
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
      ) : !error ? (
        <div className="optpilot-empty">
          {loading ? "Loading Firestore trades..." : user ? "No Firestore trade data yet for this user." : "Login on Home to unlock Portfolio.Trades."}
        </div>
      ) : null}
    </div>
  );
}
