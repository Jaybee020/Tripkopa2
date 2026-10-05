"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Banknote,
  Check,
  Clock3,
  CreditCard,
  FileSearch,
  Filter,
  LayoutDashboard,
  Landmark,
  ListChecks,
  LogOut,
  Menu,
  Plane,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  getMe,
  getOperationsBookingById,
  getOperationsOverview,
  getOperationsRules,
  listOperationsBookings,
  listOperationsReconciliation,
  logout,
  postOperationsBookingsCancelByBookingId,
  postOperationsBookingsRetryTicketingByBookingId,
  updateOperationsRules,
  updateOperationsCustomerTrustTier,
} from "@/lib/api/client";
import type {
  CurrentUser,
  OperationsBookingDetail,
  OperationsBookingList,
  OperationsOverview,
  OperationsRuleConfig,
  ReconciliationReport,
} from "@/lib/api-contracts";

type RecordValue = Record<string, unknown>;
type QueueStatus = "Needs review" | "In progress" | "Resolved";
type NavItem = "Overview" | "Bookings" | "Customers" | "Deposits" | "Rules" | "Reconciliation";
type RouteCategory = "domestic" | "regional" | "international";
type TrustTier = "OBSERVER" | "EXPLORER" | "VOYAGER" | "NAVIGATOR" | "AMBASSADOR";

const ROUTES: RouteCategory[] = ["domestic", "regional", "international"];
const TIERS: TrustTier[] = ["OBSERVER", "EXPLORER", "VOYAGER", "NAVIGATOR", "AMBASSADOR"];

const REVIEW_STATUSES = new Set([
  "MANUAL_REVIEW",
  "CANCELLATION_PENDING",
  "CANCELLATION_REVIEW",
  "FAILED",
  "PAYMENT_RECEIVED",
  "BOOKING_IN_PROGRESS",
  "OVERDUE",
]);

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}

function text(value: unknown, fallback = "-") {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0,
      }).format(amount)
    : "-";
}

function ageFrom(value: unknown) {
  if (typeof value !== "string") return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr`;
  return `${Math.floor(minutes / 1440)} d`;
}

function dateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function customerName(value: unknown) {
  const customer = asRecord(value);
  const name = [customer.first_name, customer.middle_name, customer.last_name]
    .map((part) => text(part, "").trim())
    .filter(Boolean)
    .join(" ");
  return name || text(customer.email, text(customer.whatsapp_number, "Unnamed customer"));
}

function passengerName(value: unknown) {
  const passenger = asRecord(value);
  return [
    passenger.title,
    passenger.first_name || passenger.firstName,
    passenger.middle_name || passenger.middleName,
    passenger.last_name || passenger.lastName,
  ]
    .map((part) => text(part, "").trim())
    .filter(Boolean)
    .join(" ") || "Passenger";
}

function queueStatus(value: unknown): QueueStatus {
  const status = text(value, "").toUpperCase();
  if (["TICKETED", "PAID", "RESOLVED", "CANCELLED", "REFUNDED"].includes(status)) {
    return "Resolved";
  }
  if (["AWAITING_PAYMENT", "AWAITING_DEPOSIT", "PARTIALLY_PAID", "PAYMENT_RECEIVED", "BOOKING_IN_PROGRESS"].includes(status)) {
    return "In progress";
  }
  return "Needs review";
}

function statusClass(value: unknown) {
  return queueStatus(value).toLowerCase().replace(" ", "-");
}

function canRetryTicketing(booking: RecordValue | null) {
  const status = text(booking?.status, "").toUpperCase();
  return ["MANUAL_REVIEW", "PAYMENT_RECEIVED", "BOOKING_IN_PROGRESS", "PAID"].includes(status);
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Clock3;
  tone: "blue" | "green" | "amber" | "red";
}) {
  return (
    <article className="ops-metric">
      <div className={`ops-metric-icon ${tone}`}>
        <Icon size={17} />
      </div>
      <div className="ops-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={tone === "red" || tone === "amber" ? "negative" : "positive"}>
          {detail}
        </small>
      </div>
    </article>
  );
}

function DetailList({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <div className="ops-detail-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{text(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function OperationsDashboard() {
  const [activeNav, setActiveNav] = useState<NavItem>("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bookings, setBookings] = useState<OperationsBookingList | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [rules, setRules] = useState<OperationsRuleConfig | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All statuses" | QueueStatus>("All statuses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OperationsBookingDetail | null>(null);
  const [rulesJson, setRulesJson] = useState("{}");
  const [tierOverride, setTierOverride] = useState("");
  const [tierReason, setTierReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadDashboard = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const [bookingData, reconData, userData, ruleData, overviewData] = await Promise.all([
        listOperationsBookings(),
        listOperationsReconciliation(),
        getMe(),
        getOperationsRules(),
        getOperationsOverview(),
      ]);
      setBookings(bookingData);
      setReconciliation(reconData);
      setMe(userData);
      setRules(ruleData);
      setOverview(overviewData);
      setRulesJson(JSON.stringify(ruleData.value, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operations data.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      listOperationsBookings(),
      listOperationsReconciliation(),
      getMe(),
      getOperationsRules(),
      getOperationsOverview(),
    ])
      .then(([bookingData, reconData, userData, ruleData, overviewData]) => {
        if (!active) return;
        setBookings(bookingData);
        setReconciliation(reconData);
        setMe(userData);
        setRules(ruleData);
        setOverview(overviewData);
        setRulesJson(JSON.stringify(ruleData.value, null, 2));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load operations data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let active = true;
    getOperationsBookingById(selectedId)
      .then((data) => {
        if (active) {
          setDetail(data);
          setTierOverride(text(asRecord(data.customer).trust_tier_override, ""));
          setTierReason("");
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load booking detail.");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const rows = useMemo(() => bookings?.bookings.map(asRecord) ?? [], [bookings]);
  const customerRows = useMemo(
    () => overview?.customers.map(asRecord) ?? [],
    [overview],
  );
  const depositRows = useMemo(
    () => overview?.deposits.map(asRecord) ?? [],
    [overview],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((booking) => {
        const haystack = [
          booking.id,
          booking.customer_id,
          booking.booking_type,
          booking.status,
          booking.provider_reference,
          customerName(booking.customer),
          asRecord(booking.flight).origin,
          asRecord(booking.flight).destination,
          asRecord(booking.flight).carrier,
        ]
          .map((value) => text(value, ""))
          .join(" ")
          .toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (status === "All statuses" || queueStatus(booking.status) === status)
        );
      }),
    [query, rows, status],
  );

  const openCount = rows.filter((booking) => queueStatus(booking.status) !== "Resolved").length;
  const reviewCount = rows.filter((booking) => REVIEW_STATUSES.has(text(booking.status, "").toUpperCase())).length;
  const displayName = text(asRecord(me?.user).email, "Operations staff");
  const selectedBooking = detail ? asRecord(detail.booking) : null;
  const selectedCustomer = detail ? asRecord(detail.customer) : null;
  const selectedFlight = asRecord(selectedBooking?.flight);
  const selectedWallet = detail ? asRecord(detail.wallet) : {};
  const selectedAccount = detail ? asRecord(detail.virtual_account) : {};
  const ruleValue = asRecord(rules?.value);
  const draftRuleValue = useMemo(() => {
    try {
      return asRecord(JSON.parse(rulesJson));
    } catch {
      return {};
    }
  }, [rulesJson]);

  const ruleNumber = (path: string[], fallback = 0) => {
    let value: unknown = draftRuleValue;
    for (const key of path) value = asRecord(value)[key];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const updateRuleDraft = (mutate: (draft: RecordValue) => void) => {
    setRulesJson((current) => {
      try {
        const draft = asRecord(JSON.parse(current));
        mutate(draft);
        return JSON.stringify(draft, null, 2);
      } catch {
        setError("Fix the advanced JSON before using the rule controls.");
        return current;
      }
    });
  };

  const setRuleNumber = (path: string[], raw: string, percentage = false) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    updateRuleDraft((draft) => {
      let target = draft;
      for (const key of path.slice(0, -1)) {
        target[key] = asRecord(target[key]);
        target = target[key] as RecordValue;
      }
      target[path.at(-1)!] = percentage ? parsed / 100 : parsed;
      if (path[0] === "repayment_due_days_before_departure") {
        draft.generated_due_days_before_departure = parsed;
      }
      if (path[0] === "max_financing_weeks" && path[1]) {
        const markup = asRecord(draft.markup);
        const brackets = Array.isArray(markup[path[1]]) ? [...markup[path[1]] as unknown[]] : [];
        const lastIndex = brackets.length - 1;
        if (lastIndex >= 0 && Array.isArray(brackets[lastIndex])) {
          const finalBracket = [...brackets[lastIndex] as unknown[]];
          finalBracket[0] = parsed;
          brackets[lastIndex] = finalBracket;
          markup[path[1]] = brackets;
          draft.markup = markup;
        }
      }
      if (path[0] === "repayment_due_days_before_departure" || path[0] === "grace_period_days") {
        const due = Number(draft.repayment_due_days_before_departure || 0);
        const grace = Number(draft.grace_period_days || 0);
        draft.grace_hard_stop_days_before_departure = due - grace;
      }
    });
  };

  const setMarkupRate = (route: RouteCategory, index: number, raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    updateRuleDraft((draft) => {
      const markup = asRecord(draft.markup);
      const brackets = Array.isArray(markup[route]) ? [...markup[route] as unknown[]] : [];
      const bracket = Array.isArray(brackets[index]) ? [...brackets[index] as unknown[]] : [];
      bracket[1] = parsed / 100;
      brackets[index] = bracket;
      markup[route] = brackets;
      draft.markup = markup;
    });
  };

  const refresh = async () => {
    await loadDashboard(false);
    setToast("Dashboard refreshed");
  };

  const openBooking = (bookingId: string) => {
    setDetail(null);
    setDetailLoading(true);
    setSelectedId(bookingId);
  };

  const retryTicketing = async () => {
    if (!selectedId) return;
    setActionLoading("retry");
    try {
      await postOperationsBookingsRetryTicketingByBookingId(selectedId);
      setToast("Ticketing retry submitted");
      setDetail(await getOperationsBookingById(selectedId));
      await loadDashboard(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retry ticketing.");
    } finally {
      setActionLoading("");
    }
  };

  const requestCancellation = async () => {
    if (!selectedId) return;
    setActionLoading("cancel");
    try {
      await postOperationsBookingsCancelByBookingId(selectedId, {
        reason: "Operations dashboard cancellation request",
      });
      setToast("Cancellation requested");
      setDetail(await getOperationsBookingById(selectedId));
      await loadDashboard(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request cancellation.");
    } finally {
      setActionLoading("");
    }
  };

  const saveTierOverride = async () => {
    const customerId = text(selectedCustomer?.id, "");
    if (!customerId || tierReason.trim().length < 10) {
      setError("Provide an override reason of at least 10 characters.");
      return;
    }
    setActionLoading("tier");
    try {
      await updateOperationsCustomerTrustTier(customerId, {
        tier: (tierOverride || null) as "OBSERVER" | "EXPLORER" | "VOYAGER" | "NAVIGATOR" | "AMBASSADOR" | null,
        reason: tierReason.trim(),
      });
      setDetail(await getOperationsBookingById(selectedId!));
      setToast(tierOverride ? "Trust-tier override saved" : "Trust-tier override cleared");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update trust tier.");
    } finally {
      setActionLoading("");
    }
  };

  const saveRules = async () => {
    setActionLoading("rules");
    try {
      const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
      if (parsed.rule_version === ruleValue.rule_version) {
        parsed.rule_version = `flex_admin_${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}`;
      }
      const saved = await updateOperationsRules({
        value: parsed,
        description: "MVP flexible payment rules updated from operations dashboard.",
      });
      setRules(saved);
      setRulesJson(JSON.stringify(saved.value, null, 2));
      setToast("Rules saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rules.");
    } finally {
      setActionLoading("");
    }
  };

  return (
    <div className="ops-app">
      <aside className={`ops-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="ops-brand">
          <span className="ops-brand-mark">t</span>
          <span>tripkopa</span>
          <button className="ops-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <nav className="ops-nav" aria-label="Operations navigation">
          {[
            ["Overview", LayoutDashboard],
            ["Bookings", FileSearch],
            ["Customers", Users],
            ["Deposits", Banknote],
            ["Rules", Settings2],
            ["Reconciliation", SlidersHorizontal],
          ].map(([label, Icon]) => (
            <button
              key={label as string}
              className={activeNav === label ? "active" : ""}
              onClick={() => {
                setActiveNav(label as NavItem);
                setMobileOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label as string}</span>
              {label === "Bookings" && <b>{openCount}</b>}
              {label === "Customers" && <b>{overview?.metrics.customers ?? 0}</b>}
            </button>
          ))}
        </nav>
        <div className="ops-sidebar-bottom">
          <button onClick={() => setActiveNav("Rules")}>
            <Settings2 size={17} />
            Rule settings
          </button>
          <div className="ops-profile">
            <div className="ops-avatar">{displayName.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{displayName}</strong>
              <span>Administrator</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <button className="ops-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={21} />
          </button>
          <div className="ops-breadcrumb">
            <span>Operations</span>
            <span>/</span>
            <strong>{activeNav}</strong>
          </div>
          <div className="ops-top-actions">
            <button className="ops-icon-button" onClick={() => setToast("No new alerts")} aria-label="Notifications">
              <Bell size={18} />
              <i />
            </button>
            <button
              className="ops-signout"
              onClick={async () => {
                await logout();
                window.location.assign("/ops/login");
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <div className="ops-content">
          <div className="ops-page-heading">
            <div>
              <div className="ops-eyebrow">
                <span />
                Flexible payment control
              </div>
              <h1>Operations dashboard</h1>
              <p>Review funding, ticketing, repayment, cancellation, and rule state from one place.</p>
            </div>
            <button className="ops-refresh" onClick={refresh} disabled={loading}>
              {loading ? <span className="ops-spinner" /> : <RefreshCw size={16} />}
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>

          {error && (
            <button className="ops-error" role="alert" onClick={() => setError("")}>
              {error}
            </button>
          )}

          <section className="ops-metrics" aria-label="Operational metrics">
            <Metric label="Deposits received" value={loading ? "-" : money(overview?.metrics.total_deposited)} detail={`${overview?.metrics.successful_deposits ?? 0} successful transfers`} icon={Banknote} tone="green" />
            <Metric label="Wallet balance" value={loading ? "-" : money(overview?.metrics.wallet_balance)} detail={`${money(overview?.metrics.unallocated_funds)} currently unallocated`} icon={WalletCards} tone="blue" />
            <Metric label="Virtual accounts" value={loading ? "-" : String(overview?.metrics.active_virtual_accounts ?? 0)} detail={`${overview?.metrics.customers ?? 0} customers`} icon={Landmark} tone="blue" />
            <Metric label="Open bookings" value={loading ? "-" : String(openCount)} detail={`${reviewCount} need attention`} icon={FileSearch} tone={reviewCount ? "red" : "amber"} />
          </section>

          {(activeNav === "Overview" || activeNav === "Bookings") && (
          <section className="ops-dashboard-grid">
            <article className="ops-card ops-queue-card">
              <div className="ops-card-header">
                <div>
                  <span className="ops-card-kicker">Booking queue</span>
                  <h2>Funding and ticketing state</h2>
                </div>
                <button className="ops-quiet-button" onClick={() => { setQuery(""); setStatus("All statuses"); }}>
                  Clear filters
                </button>
              </div>
              <div className="ops-toolbar">
                <div className="ops-search">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search booking, customer, status" />
                </div>
                <div className="ops-filter">
                  <Filter size={15} />
                  <select value={status} onChange={(event) => setStatus(event.target.value as "All statuses" | QueueStatus)}>
                    <option>All statuses</option>
                    <option>Needs review</option>
                    <option>In progress</option>
                    <option>Resolved</option>
                  </select>
                </div>
              </div>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Booking / customer</th>
                      <th>Flight</th>
                      <th>Funding</th>
                      <th>Status</th>
                      <th>Departure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((booking) => (
                      <tr key={text(booking.id)} onClick={() => openBooking(text(booking.id))}>
                        <td>
                          <div className="ops-case-id">
                            <span className={`ops-severity ${queueStatus(booking.status) === "Needs review" ? "high" : queueStatus(booking.status) === "In progress" ? "medium" : ""}`} />
                            <strong>{text(booking.id).slice(0, 8)}</strong>
                          </div>
                          <small>{customerName(booking.customer)}</small>
                        </td>
                        <td>
                          <strong>{text(asRecord(booking.flight).origin)} → {text(asRecord(booking.flight).destination)}</strong>
                          <small>{text(asRecord(booking.flight).carrier, text(asRecord(booking.flight).carrier_code))} · {text(asRecord(booking.flight).flight_number)} · {text(asRecord(booking.flight).trip_type)}</small>
                        </td>
                        <td>
                          <strong>{money(booking.amount_paid)} paid</strong>
                          <small>{money(booking.balance_amount)} due · {text(booking.booking_type)}</small>
                        </td>
                        <td>
                          <span className={`ops-status ${statusClass(booking.status)}`}>{text(booking.status)}</span>
                        </td>
                        <td>
                          <strong>{dateTime(asRecord(booking.flight).departure_at || booking.departure_date)}</strong>
                          <small>{ageFrom(booking.created_at)} old</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="ops-side-stack">
              <article className="ops-card">
                <div className="ops-card-header">
                  <div>
                    <span className="ops-card-kicker">Rules</span>
                    <h2>{text(ruleValue.rule_version, "MVP rules")}</h2>
                  </div>
                  <button className="ops-icon-button small" onClick={() => setActiveNav("Rules")} aria-label="Open rules">
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <DetailList rows={[
                  ["Deposit rate", "Tier and route based"],
                  ["Full fee", `${Number(ruleValue.full_service_fee_rate || 0) * 100}%`],
                  ["Domestic installments", asRecord(ruleValue.max_installments).domestic],
                  ["International installments", asRecord(ruleValue.max_installments).international],
                ]} />
              </article>
              <article className="ops-card">
                <div className="ops-card-header">
                  <div>
                    <span className="ops-card-kicker">Provider switches</span>
                    <h2>Runtime flags</h2>
                  </div>
                  <Zap size={17} />
                </div>
                <div className="ops-provider-list">
                  <div className="ops-provider">
                    <span className="ops-provider-status" />
                    <div><strong>QoreID mock</strong><small>Controlled by Vercel env</small></div>
                    <code>QOREID_MOCK_BVN_SUCCESS</code>
                  </div>
                  <div className="ops-provider">
                    <span className="ops-provider-status" />
                    <div><strong>TakeTrips mock order</strong><small>Use for dry-run ticketing</small></div>
                    <code>TAKETRIPS_MOCK_ORDER_SUCCESS</code>
                  </div>
                </div>
              </article>
            </aside>
          </section>
          )}

          {activeNav === "Customers" && (
            <section className="ops-card ops-data-panel">
              <div className="ops-card-header">
                <div>
                  <span className="ops-card-kicker">Customer directory</span>
                  <h2>Identity, KYC, wallets and accounts</h2>
                </div>
                <span className="ops-count-pill">{customerRows.length} customers</span>
              </div>
              <div className="ops-table-wrap">
                <table className="ops-table ops-wide-table">
                  <thead><tr><th>Customer</th><th>Contact</th><th>KYC</th><th>Virtual account</th><th>Wallet</th><th>Bookings</th></tr></thead>
                  <tbody>
                    {customerRows.map((customer) => {
                      const wallet = asRecord(customer.wallet);
                      const account = asRecord(customer.virtual_account);
                      const kyc = asRecord(customer.latest_kyc);
                      const summary = asRecord(customer.booking_summary);
                      return (
                        <tr key={text(customer.id)}>
                          <td><strong>{customerName(customer)}</strong><small>{text(customer.status)} · {text(customer.trust_tier_override, text(customer.trust_tier))}</small></td>
                          <td><strong>{text(customer.whatsapp_number)}</strong><small>{text(customer.email)}</small></td>
                          <td><span className={`ops-status ${text(kyc.status, "").toUpperCase() === "VERIFIED" ? "resolved" : "in-progress"}`}>{text(kyc.status, "NOT STARTED")}</span><small>{text(kyc.provider)}</small></td>
                          <td><strong className="ops-account-number">{text(account.account_number, "Not generated")}</strong><small>{text(account.bank_name)} · {text(account.status)}</small></td>
                          <td><strong>{money(wallet.balance)}</strong><small>{text(wallet.currency, "NGN")} available</small></td>
                          <td><strong>{text(summary.total, "0")} total · {text(summary.open, "0")} open</strong><small>{money(summary.outstanding)} outstanding</small></td>
                        </tr>
                      );
                    })}
                    {!customerRows.length && <tr><td colSpan={6}><div className="ops-empty"><Users size={22} /><strong>No customers found</strong></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeNav === "Deposits" && (
            <section className="ops-card ops-data-panel">
              <div className="ops-card-header">
                <div>
                  <span className="ops-card-kicker">Money movement</span>
                  <h2>Deposits and wallet allocation</h2>
                </div>
                <span className="ops-count-pill">{depositRows.length} records</span>
              </div>
              <div className="ops-table-wrap">
                <table className="ops-table ops-wide-table">
                  <thead><tr><th>Received</th><th>Customer / account</th><th>Reference</th><th>Amount</th><th>Allocation</th><th>Status</th></tr></thead>
                  <tbody>
                    {depositRows.map((deposit) => {
                      const customer = asRecord(deposit.customer);
                      const account = asRecord(deposit.virtual_account);
                      return (
                        <tr key={text(deposit.id)}>
                          <td><strong>{dateTime(deposit.updated_at || deposit.created_at)}</strong><small>{ageFrom(deposit.updated_at || deposit.created_at)} ago</small></td>
                          <td><strong>{customerName(customer)}</strong><small>{text(account.account_number)} · {text(account.bank_name)}</small></td>
                          <td><strong className="ops-reference">{text(deposit.provider_reference)}</strong><small>{text(deposit.payment_type)}</small></td>
                          <td><strong>{money(deposit.amount)}</strong><small>{text(deposit.currency)}</small></td>
                          <td><strong>{money(deposit.allocated_amount)} directly allocated</strong><small>{money(deposit.unallocated_amount)} not linked from this receipt</small></td>
                          <td><span className={`ops-status ${text(deposit.status).toUpperCase() === "SUCCEEDED" ? "resolved" : "in-progress"}`}>{text(deposit.status)}</span></td>
                        </tr>
                      );
                    })}
                    {!depositRows.length && <tr><td colSpan={6}><div className="ops-empty"><Banknote size={22} /><strong>No deposits received</strong><span>OneCap webhook deposits will appear here.</span></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeNav === "Reconciliation" && (
            <section className="ops-card ops-data-panel">
              <div className="ops-card-header">
                <div><span className="ops-card-kicker">Provider controls</span><h2>Reconciliation exceptions</h2></div>
                <span className="ops-count-pill">{reconciliation?.total ?? 0} records</span>
              </div>
              <div className="ops-mini-list ops-reconciliation-list">
                {(reconciliation?.records || []).map((item) => {
                  const row = asRecord(item);
                  return <div key={text(row.id)}><strong>{text(row.status)} · {money(row.difference)}</strong><span>{text(row.provider_reference)} · {dateTime(row.created_at)}</span></div>;
                })}
                {!reconciliation?.total && <div><strong>No reconciliation exceptions</strong><span>Automated deposit polling is not configured; this view only shows records already created.</span></div>}
              </div>
            </section>
          )}

          {activeNav === "Rules" && (
            <section className="ops-card ops-rules-panel">
              <div className="ops-card-header">
                <div>
                  <span className="ops-card-kicker">Admin rules</span>
                  <h2>Flexible payment rule config</h2>
                </div>
                <button className="ops-primary-button" onClick={saveRules} disabled={actionLoading === "rules"}>
                  <Save size={15} />
                  {actionLoading === "rules" ? "Saving" : "Save rules"}
                </button>
              </div>
              <div className="ops-rule-section">
                <div className="ops-rule-section-head">
                  <h3>Pricing and repayment timing</h3>
                  <p>Configure customer-facing fees and the calendar limits applied to every flexible plan.</p>
                </div>
                <div className="ops-rule-grid">
                  <label className="ops-rule-field">
                    <span>Full-payment service fee (%)</span>
                    <input type="number" min="0.01" max="99" step="0.01" value={ruleNumber(["full_service_fee_rate"]) * 100} onChange={(event) => setRuleNumber(["full_service_fee_rate"], event.target.value, true)} />
                  </label>
                  <label className="ops-rule-field">
                    <span>Minimum days before departure</span>
                    <input type="number" min="21" step="1" value={ruleNumber(["minimum_days_before_departure"], 21)} onChange={(event) => setRuleNumber(["minimum_days_before_departure"], event.target.value)} />
                  </label>
                  <label className="ops-rule-field">
                    <span>Payment due before departure (days)</span>
                    <input type="number" min="1" step="1" value={ruleNumber(["repayment_due_days_before_departure"], 10)} onChange={(event) => setRuleNumber(["repayment_due_days_before_departure"], event.target.value)} />
                  </label>
                  <label className="ops-rule-field">
                    <span>Grace period (days)</span>
                    <input type="number" min="1" max={Math.max(1, ruleNumber(["repayment_due_days_before_departure"], 10) - 1)} step="1" value={ruleNumber(["grace_period_days"], 3)} onChange={(event) => setRuleNumber(["grace_period_days"], event.target.value)} />
                  </label>
                </div>
                <div className="ops-policy-note">
                  Pre-travel repayments finish 10 days before travel. Voyager, Navigator, and Ambassador may carry a controlled balance for up to {ruleNumber(["post_travel_max_days"], 90)} days after travel. Grace currently ends {ruleNumber(["grace_hard_stop_days_before_departure"], 7)} days before departure.
                </div>
              </div>

              <div className="ops-rule-section">
                <div className="ops-rule-section-head">
                  <h3>Route repayment limits</h3>
                  <p>Set the maximum financing window and number of repayments for each route class.</p>
                </div>
                <div className="ops-route-rule-grid">
                  {ROUTES.map((route) => (
                    <article key={route}>
                      <strong>{route}</strong>
                      <label className="ops-rule-field">
                        <span>Maximum weeks</span>
                        <input type="number" min="1" step="1" value={ruleNumber(["max_financing_weeks", route])} onChange={(event) => setRuleNumber(["max_financing_weeks", route], event.target.value)} />
                      </label>
                      <label className="ops-rule-field">
                        <span>Maximum repayments</span>
                        <input type="number" min="1" step="1" value={ruleNumber(["max_installments", route])} onChange={(event) => setRuleNumber(["max_installments", route], event.target.value)} />
                      </label>
                    </article>
                  ))}
                </div>
              </div>

              <div className="ops-rule-section">
                <div className="ops-rule-section-head">
                  <h3>Flexible-plan markup</h3>
                  <p>These are commercial markup percentages by repayment window, not an APR.</p>
                </div>
                <div className="ops-markup-grid">
                  {ROUTES.map((route) => {
                    const brackets = asRecord(draftRuleValue.markup)[route];
                    return (
                      <article key={route}>
                        <strong>{route}</strong>
                        {(Array.isArray(brackets) ? brackets : []).map((entry, index) => {
                          const bracket = Array.isArray(entry) ? entry : [];
                          return (
                            <label className="ops-rule-field" key={`${route}-${index}`}>
                              <span>Up to {Number(bracket[0] || 0)} weeks (%)</span>
                              <input type="number" min="0.01" max="99" step="0.01" value={Number(bracket[1] || 0) * 100} onChange={(event) => setMarkupRate(route, index, event.target.value)} />
                            </label>
                          );
                        })}
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="ops-rule-section">
                <div className="ops-rule-section-head">
                  <h3>Tier deposits and financing caps</h3>
                  <p>Control the minimum upfront deposit and maximum party total for every tier and route.</p>
                </div>
                <div className="ops-tier-table-wrap">
                  <table className="ops-tier-table">
                    <thead><tr><th>Tier</th>{ROUTES.map((route) => <th key={`${route}-deposit`}>{route} deposit</th>)}{ROUTES.map((route) => <th key={`${route}-cap`}>{route} cap (NGN)</th>)}</tr></thead>
                    <tbody>
                      {TIERS.map((tier) => (
                        <tr key={tier}>
                          <th>{tier}</th>
                          {ROUTES.map((route) => <td key={`${tier}-${route}-deposit`}><input aria-label={`${tier} ${route} deposit percentage`} type="number" min="1" max="99" step="0.01" value={ruleNumber(["deposit_rates", tier, route]) * 100} onChange={(event) => setRuleNumber(["deposit_rates", tier, route], event.target.value, true)} /></td>)}
                          {ROUTES.map((route) => <td key={`${tier}-${route}-cap`}><input aria-label={`${tier} ${route} financing cap`} type="number" min="1" step="1000" value={ruleNumber(["financing_caps", tier, route])} onChange={(event) => setRuleNumber(["financing_caps", tier, route], event.target.value)} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ops-rule-section">
                <div className="ops-rule-section-head">
                  <h3>Post-travel settlement and cancellation</h3>
                  <p>Set eligible post-travel balance limits and the platform cancellation deduction for every tier and route.</p>
                </div>
                <div className="ops-tier-table-wrap">
                  <table className="ops-tier-table">
                    <thead><tr><th>Tier</th><th>Post-travel max</th>{ROUTES.map((route) => <th key={`${route}-cancellation`}>{route} cancellation</th>)}</tr></thead>
                    <tbody>
                      {TIERS.map((tier) => (
                        <tr key={`${tier}-billing`}>
                          <th>{tier}</th>
                          <td><input aria-label={`${tier} post-travel maximum percentage`} type="number" min="0" max="30" step="0.01" value={ruleNumber(["post_travel_rates", tier]) * 100} onChange={(event) => setRuleNumber(["post_travel_rates", tier], event.target.value, true)} /></td>
                          {ROUTES.map((route) => <td key={`${tier}-${route}-cancellation`}><input aria-label={`${tier} ${route} cancellation percentage`} type="number" min="0.01" max={ruleNumber(["cancellation_fee_caps", route]) * 100} step="0.01" value={ruleNumber(["cancellation_rates", tier, route]) * 100} onChange={(event) => setRuleNumber(["cancellation_rates", tier, route], event.target.value, true)} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ops-policy-note">
                  Airline penalties remain separate from Tripkopa cancellation deductions. Approved campaigns and promotional benefits are controlled in the advanced policy JSON; blanket discounts remain disabled.
                </div>
              </div>

              <details className="ops-advanced-rules">
                <summary>Advanced JSON editor</summary>
                <label className="ops-rules-json">
                  <span>Versioned financing rule JSON</span>
                  <textarea value={rulesJson} onChange={(event) => setRulesJson(event.target.value)} spellCheck={false} />
                </label>
              </details>
            </section>
          )}
        </div>
      </main>

      {selectedId && (
        <div className="ops-modal-backdrop" role="presentation" onMouseDown={() => { setSelectedId(null); setDetail(null); }}>
          <section className="ops-modal ops-booking-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="ops-modal-head">
              <div>
                <span className="ops-card-kicker">Booking detail</span>
                <h2>{selectedId.slice(0, 8)}</h2>
              </div>
              <button className="ops-icon-button" onClick={() => { setSelectedId(null); setDetail(null); }} aria-label="Close detail">
                <X size={18} />
              </button>
            </div>
            {detailLoading || !detail ? (
              <div className="ops-empty"><span className="ops-spinner" /><strong>Loading booking detail</strong></div>
            ) : (
              <>
                <div className="ops-modal-summary">
                  <div><span>Status</span><strong>{text(selectedBooking?.status)}</strong></div>
                  <div><span>Customer</span><strong>{customerName(selectedCustomer)}</strong></div>
                  <div><span>Balance</span><strong>{money(selectedBooking?.balance_amount)}</strong></div>
                </div>
                <div className="ops-detail-grid">
                  <article>
                    <h3><Plane size={15} /> Booking</h3>
                    <DetailList rows={[
                      ["Type", selectedBooking?.booking_type],
                      ["Route", selectedBooking?.route_category],
                      ["Trust tier", detail.financing_profile?.effective_tier || selectedBooking?.trust_tier_at_booking],
                      ["Ticket", selectedBooking?.ticket_type],
                      ["Total", money(selectedBooking?.total_amount)],
                      ["Paid", money(selectedBooking?.amount_paid)],
                      ["Deposit", money(selectedBooking?.deposit_amount)],
                      ["Provider ref", selectedBooking?.provider_reference],
                      ["Repayment deadline", selectedBooking?.repayment_deadline],
                      ["Grace deadline", selectedBooking?.grace_deadline],
                      ["Post-travel", money(selectedBooking?.post_travel_amount)],
                    ]} />
                  </article>
                  <article className="ops-detail-span">
                    <h3><Plane size={15} /> Flight itinerary</h3>
                    <div className="ops-flight-summary">
                      <div className="ops-route-display">
                        <strong>{text(selectedFlight.origin)}</strong>
                        <span><Plane size={14} /> {text(selectedFlight.segment_count, "0")} segment(s)</span>
                        <strong>{text(selectedFlight.destination)}</strong>
                      </div>
                      <DetailList rows={[
                        ["Airline", selectedFlight.carrier || selectedFlight.carrier_code],
                        ["Flight", selectedFlight.flight_number],
                        ["Departure", dateTime(selectedFlight.departure_at || selectedBooking?.departure_date)],
                        ["Arrival", dateTime(selectedFlight.arrival_at)],
                        ["Cabin", selectedFlight.cabin_class],
                        ["Trip", selectedFlight.trip_type],
                        ["Stops", selectedFlight.stops],
                      ]} />
                    </div>
                    <div className="ops-passenger-list">
                      <span>Passengers</span>
                      {(Array.isArray(selectedBooking?.passengers) ? selectedBooking.passengers : []).map((passenger, index) => (
                        <strong key={`${passengerName(passenger)}-${index}`}>{passengerName(passenger)}</strong>
                      ))}
                    </div>
                  </article>
                  <article>
                    <h3><Users size={15} /> Customer</h3>
                    <DetailList rows={[
                      ["Name", customerName(selectedCustomer)],
                      ["WhatsApp", selectedCustomer?.whatsapp_number],
                      ["Email", selectedCustomer?.email],
                      ["Date of birth", selectedCustomer?.date_of_birth],
                      ["Gender", selectedCustomer?.gender],
                      ["Account status", selectedCustomer?.status],
                      ["KYC", detail.kyc_sessions?.length ? asRecord(detail.kyc_sessions[0]).status : "Not started"],
                    ]} />
                  </article>
                  <article>
                    <h3><Landmark size={15} /> Wallet and virtual account</h3>
                    <DetailList rows={[
                      ["Wallet balance", money(selectedWallet.balance)],
                      ["Currency", selectedWallet.currency],
                      ["Account number", selectedAccount.account_number],
                      ["Account name", selectedAccount.account_name],
                      ["Bank", selectedAccount.bank_name],
                      ["Account status", selectedAccount.status],
                    ]} />
                  </article>
                  <article>
                    <h3><CreditCard size={15} /> Payments</h3>
                    <div className="ops-mini-list">
                      {detail.payments.map((payment) => {
                        const row = asRecord(payment);
                        return <div key={text(row.id)}><strong>{money(row.amount)}</strong><span>{text(row.status)} · {text(row.payment_type)}</span></div>;
                      })}
                      {detail.payments.length === 0 && <span>No booking payments yet</span>}
                    </div>
                  </article>
                  <article>
                    <h3><Banknote size={15} /> Customer deposits</h3>
                    <div className="ops-mini-list">
                      {(detail.customer_deposits || []).map((payment) => {
                        const row = asRecord(payment);
                        return <div key={text(row.id)}><strong>{money(row.amount)} · {text(row.status)}</strong><span>{text(row.provider_reference)} · {dateTime(row.created_at)}</span></div>;
                      })}
                      {!detail.customer_deposits?.length && <span>No OneCap deposits yet</span>}
                    </div>
                  </article>
                  <article>
                    <h3><ListChecks size={15} /> Installments</h3>
                    <div className="ops-mini-list">
                      {detail.installments.map((installment) => {
                        const row = asRecord(installment);
                        return <div key={text(row.id)}><strong>#{text(row.sequence_number)} {money(row.amount)}</strong><span>{text(row.phase)} · due {text(row.due_date)} · {text(row.status)} · paid {money(row.paid_amount)}</span></div>;
                      })}
                      {detail.installments.length === 0 && <span>No installments</span>}
                    </div>
                  </article>
                  <article>
                    <h3><WalletCards size={15} /> Ledger</h3>
                    <div className="ops-mini-list">
                      {detail.ledger_entries.slice(0, 5).map((entry) => {
                        const row = asRecord(entry);
                        return <div key={text(row.id)}><strong>{money(row.amount)}</strong><span>{text(row.direction)} · {text(row.account_code)}</span></div>;
                      })}
                      {detail.ledger_entries.length === 0 && <span>No booking ledger entries</span>}
                    </div>
                  </article>
                  <article>
                    <h3><ShieldCheck size={15} /> Trust tier</h3>
                    <DetailList rows={[
                      ["Computed", detail.financing_profile?.computed_tier],
                      ["Effective", detail.financing_profile?.effective_tier],
                      ["Successful cycles", detail.financing_profile?.successful_cycles],
                      ["On-time rate", `${Math.round(Number(detail.financing_profile?.on_time_repayment_rate || 0) * 100)}%`],
                    ]} />
                    <label className="ops-rule-field ops-tier-control">
                      <span>Admin override</span>
                      <select value={tierOverride} onChange={(event) => setTierOverride(event.target.value)}>
                        <option value="">No override</option>
                        {['OBSERVER','EXPLORER','VOYAGER','NAVIGATOR','AMBASSADOR'].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                      </select>
                      <input value={tierReason} onChange={(event) => setTierReason(event.target.value)} placeholder="Audited reason (minimum 10 characters)" />
                      <button className="ops-secondary-button" onClick={saveTierOverride} disabled={actionLoading === "tier"}>Save override</button>
                    </label>
                  </article>
                </div>
                <div className="ops-modal-actions">
                  <button className="ops-secondary-button" onClick={requestCancellation} disabled={actionLoading === "cancel"}>
                    <AlertTriangle size={15} />
                    {actionLoading === "cancel" ? "Requesting" : "Request cancellation"}
                  </button>
                  <button className="ops-primary-button" onClick={retryTicketing} disabled={!canRetryTicketing(selectedBooking) || actionLoading === "retry"}>
                    <Plane size={15} />
                    {actionLoading === "retry" ? "Retrying" : "Retry ticketing"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {toast && (
        <button className="ops-toast" role="status" onClick={() => setToast("")}>
          <Check size={16} />
          {toast}
        </button>
      )}
    </div>
  );
}
