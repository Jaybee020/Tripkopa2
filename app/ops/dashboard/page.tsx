"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Check,
  Clock3,
  CreditCard,
  FileSearch,
  Filter,
  LayoutDashboard,
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
  X,
  Zap,
} from "lucide-react";
import {
  getMe,
  getOperationsBookingById,
  getOperationsRules,
  listOperationsBookings,
  listOperationsReconciliation,
  logout,
  postOperationsBookingsCancelByBookingId,
  postOperationsBookingsRetryTicketingByBookingId,
  updateOperationsRules,
} from "@/lib/api/client";
import type {
  CurrentUser,
  OperationsBookingDetail,
  OperationsBookingList,
  OperationsRuleConfig,
  ReconciliationReport,
} from "@/lib/api-contracts";

type RecordValue = Record<string, unknown>;
type QueueStatus = "Needs review" | "In progress" | "Resolved";
type NavItem = "Overview" | "Bookings" | "Rules" | "Reconciliation";

const REVIEW_STATUSES = new Set([
  "MANUAL_REVIEW",
  "CANCELLATION_PENDING",
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
  const [rules, setRules] = useState<OperationsRuleConfig | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All statuses" | QueueStatus>("All statuses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OperationsBookingDetail | null>(null);
  const [rulesDraft, setRulesDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadDashboard = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const [bookingData, reconData, userData, ruleData] = await Promise.all([
        listOperationsBookings(),
        listOperationsReconciliation(),
        getMe(),
        getOperationsRules(),
      ]);
      setBookings(bookingData);
      setReconciliation(reconData);
      setMe(userData);
      setRules(ruleData);
      setRulesDraft(asRecord(ruleData.value));
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
    ])
      .then(([bookingData, reconData, userData, ruleData]) => {
        if (!active) return;
        setBookings(bookingData);
        setReconciliation(reconData);
        setMe(userData);
        setRules(ruleData);
        setRulesDraft(asRecord(ruleData.value));
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
        if (active) setDetail(data);
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
  const filteredRows = useMemo(
    () =>
      rows.filter((booking) => {
        const haystack = [
          booking.id,
          booking.customer_id,
          booking.booking_type,
          booking.status,
          booking.provider_reference,
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
  const flexibleCount = rows.filter((booking) => text(booking.booking_type, "").toLowerCase() === "flexible").length;
  const displayName = text(asRecord(me?.user).email, "Operations staff");
  const selectedBooking = detail ? asRecord(detail.booking) : null;
  const selectedCustomer = detail ? asRecord(detail.customer) : null;
  const ruleValue = asRecord(rules?.value);

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

  const saveRules = async () => {
    setActionLoading("rules");
    try {
      const saved = await updateOperationsRules({
        value: rulesDraft,
        description: "MVP flexible payment rules updated from operations dashboard.",
      });
      setRules(saved);
      setRulesDraft(asRecord(saved.value));
      setToast("Rules saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rules.");
    } finally {
      setActionLoading("");
    }
  };

  const updateRule = (key: string, value: string) => {
    const numeric = Number(value);
    setRulesDraft((current) => ({
      ...current,
      [key]: value === "" || Number.isNaN(numeric) ? value : numeric,
    }));
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
              <span>Operations staff</span>
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
                window.location.assign("/login");
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
            <Metric label="Open bookings" value={loading ? "-" : String(openCount)} detail="Non-terminal states" icon={FileSearch} tone="amber" />
            <Metric label="Manual review" value={loading ? "-" : String(reviewCount)} detail="Actionable queue" icon={AlertTriangle} tone="red" />
            <Metric label="Flexible plans" value={loading ? "-" : String(flexibleCount)} detail="Active history" icon={ListChecks} tone="blue" />
            <Metric label="Reconciliation" value={loading ? "-" : String(reconciliation?.total ?? 0)} detail="Ledger records" icon={ShieldCheck} tone="green" />
          </section>

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
                      <th>Booking</th>
                      <th>Type</th>
                      <th>Paid / balance</th>
                      <th>Status</th>
                      <th>Age</th>
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
                          <small>{text(booking.customer_id)}</small>
                        </td>
                        <td>
                          <strong>{text(booking.booking_type)}</strong>
                          <small>{money(booking.total_amount)}</small>
                        </td>
                        <td>
                          <strong>{money(booking.amount_paid)}</strong>
                          <small>{money(booking.balance_amount)} balance</small>
                        </td>
                        <td>
                          <span className={`ops-status ${statusClass(booking.status)}`}>{text(booking.status)}</span>
                        </td>
                        <td>
                          <span className="ops-age"><Clock3 size={13} />{ageFrom(booking.created_at)}</span>
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
                  ["Deposit rate", `${Number(ruleValue.flex_deposit_rate || 0) * 100}%`],
                  ["Full fee", `${Number(ruleValue.full_service_fee_rate || 0) * 100}%`],
                  ["Domestic installments", ruleValue.domestic_max_installments],
                  ["International installments", ruleValue.regional_international_max_installments],
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
              <div className="ops-rule-grid">
                {Object.entries(rulesDraft).map(([key, value]) => (
                  <label key={key} className="ops-rule-field">
                    <span>{key}</span>
                    <input value={text(value, "")} onChange={(event) => updateRule(key, event.target.value)} />
                  </label>
                ))}
              </div>
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
                  <div><span>Customer</span><strong>{text(selectedCustomer?.whatsapp_number, text(selectedBooking?.customer_id))}</strong></div>
                  <div><span>Balance</span><strong>{money(selectedBooking?.balance_amount)}</strong></div>
                </div>
                <div className="ops-detail-grid">
                  <article>
                    <h3><Plane size={15} /> Booking</h3>
                    <DetailList rows={[
                      ["Type", selectedBooking?.booking_type],
                      ["Total", money(selectedBooking?.total_amount)],
                      ["Paid", money(selectedBooking?.amount_paid)],
                      ["Deposit", money(selectedBooking?.deposit_amount)],
                      ["Provider ref", selectedBooking?.provider_reference],
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
                    <h3><ListChecks size={15} /> Installments</h3>
                    <div className="ops-mini-list">
                      {detail.installments.map((installment) => {
                        const row = asRecord(installment);
                        return <div key={text(row.id)}><strong>#{text(row.sequence_number)} {money(row.amount)}</strong><span>{text(row.status)} · paid {money(row.paid_amount)}</span></div>;
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
