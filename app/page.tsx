"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clipboard,
  FileCheck2,
  KeyRound,
  Menu,
  Plane,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  WalletCards,
  Webhook,
  X,
} from "lucide-react";

const flowSteps = [
  { label: "Search", detail: "Normalized offers", status: "ready", icon: Plane },
  { label: "Verify", detail: "Consent + KYC", status: "verified", icon: ShieldCheck },
  { label: "Pay", detail: "Rules decide", status: "review", icon: WalletCards },
  { label: "Book", detail: "Provider fulfilled", status: "pending", icon: FileCheck2 },
  { label: "Reconcile", detail: "Ledger settled", status: "settled", icon: Receipt },
];

const lifecycle = [
  ["01", "Search offer", "offer.normalized"],
  ["02", "Persist quote", "quote.revalidated"],
  ["03", "Verify identity", "kyc.consent_captured"],
  ["04", "Authorize payment", "payment.authorized"],
  ["05", "Book provider", "booking.created"],
  ["06", "Release itinerary", "itinerary.released"],
  ["07", "Reconcile ledger", "ledger.reconciled"],
];

const fractures = [
  { number: "01", problem: "Provider variance", control: "Normalize offers, revalidate fares, and verify webhooks before state changes." },
  { number: "02", problem: "Payment state", control: "Keep deposits, installments, refunds, and release rules explicit." },
  { number: "03", problem: "Repayment visibility", control: "Give operations an auditable ledger and recoverable state machine." },
];

const domains = [
  { icon: KeyRound, title: "Identity", copy: "Identify customers by WhatsApp number, capture consent, and track verification without hiding the decision path.", tags: ["KYC_SESSIONS", "CONSENT", "STATUS"] },
  { icon: Plane, title: "Booking", copy: "Persist quotes, revalidate fares, and coordinate TakeTrips fulfillment through deterministic booking states.", tags: ["OFFERS", "REVALIDATION", "TAKETRIPS"] },
  { icon: WalletCards, title: "Money", copy: "Configure deposits, eligibility, markups, installments, wallets, refunds, and travel credits in one financial model.", tags: ["ELIGIBILITY", "WALLETS", "REFUNDS"] },
  { icon: Scale, title: "Operations", copy: "Verify events, process idempotently, reconcile records, and route exceptions to manual review.", tags: ["LEDGER", "WEBHOOKS", "RECOVERY"] },
];

const ledgerRows = [
  { event: "booking.created", version: "v1.4", time: "2025-02-14 · --:--", state: "verified" },
  { event: "payment.authorized", version: "v2.1", time: "2025-02-14 · --:--", state: "settled" },
  { event: "itinerary.released", version: "v1.2", time: "2025-02-14 · --:--", state: "pending" },
  { event: "ledger.reconciled", version: "v3.0", time: "2025-02-14 · --:--", state: "verified" },
];

const integrations = [
  { name: "SupaOS", role: "signed events + WhatsApp agent", icon: Webhook },
  { name: "KYC adapter", role: "configurable identity provider", icon: ShieldCheck },
  { name: "Payment adapter", role: "authorized payment rails", icon: WalletCards },
  { name: "TakeTrips", role: "flight inventory + fulfillment", icon: Plane },
];

const reveal = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] } } } as const;

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} transition={{ delay: reduce ? 0 : delay }}>{children}</motion.div>;
}

function Status({ state }: { state: string }) {
  return <span className={`status status-${state}`}>{state}</span>;
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText("POST /v1/travel/quotes");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };

  return (
    <main>
      <nav className={`nav ${scrolled ? "nav-scrolled" : ""}`} aria-label="Main navigation">
        <div className="container nav-inner">
          <Link href="/" className="wordmark" aria-label="Tripkopa home">Tripkopa</Link>
          <div className="nav-links">
            <a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#integrations">Integrations</a><a href="#security">Security</a>
          </div>
          <div className="nav-actions"><Link className="text-button" href="/docs">Docs</Link><Link className="button button-primary" href="/signup">Get started</Link></div>
          <button className="menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div className="mobile-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <div className="container mobile-menu-inner">
                <a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a>
                <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
                <a href="#integrations" onClick={() => setMenuOpen(false)}>Integrations</a>
                <a href="#security" onClick={() => setMenuOpen(false)}>Security</a>
                <Link href="/docs">Docs</Link>
                <Link className="button button-primary" href="/signup">Get started</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <section className="hero section-pad">
        <div className="container">
          <motion.div className="hero-copy" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
            <motion.div className="eyebrow" variants={reveal}><i />Travel commerce infrastructure</motion.div>
            <motion.h1 variants={reveal}>The control plane for dependable travel money movement.</motion.h1>
            <motion.p className="hero-sub" variants={reveal}>Search, verify, pay, book, and reconcile through one deterministic API—built for African travel commerce and international corridors.</motion.p>
            <motion.div className="hero-actions" variants={reveal}><Link className="button button-primary" href="/signup">Start building <ArrowRight size={16} /></Link><Link className="quiet-link" href="/platform">Read the system <ArrowRight size={15} /></Link></motion.div>
          </motion.div>

          <motion.div className="flow-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.48, ease: [0.22, 1, 0.36, 1] }} aria-label="Transaction flow">
            <div className="flow-head"><span className="mono-label">TRANSACTION PATH / 01</span><span className="flow-caption">ordered state progression</span></div>
            <div className="flow-rail">{flowSteps.map((step, index) => { const Icon = step.icon; return <div className={`flow-step ${activeStep === index ? "active" : ""}`} key={step.label}><button onClick={() => setActiveStep(index)} aria-label={`View ${step.label} state`}><span className="step-index">0{index + 1}</span><Icon size={19} /><strong>{step.label}</strong><small>{step.detail}</small><Status state={step.status} /></button>{index < flowSteps.length - 1 && <span className="connector" aria-hidden="true"><ArrowRight size={14} /></span>}</div>; })}</div>
            <div className="flow-detail"><span className="mono-label">ACTIVE STATE</span><strong>{flowSteps[activeStep]?.label ?? "Search"}</strong><span>{flowSteps[activeStep]?.detail ?? "Normalized offers"}</span><code>{activeStep === 0 ? "GET /v1/travel/offers" : activeStep === 1 ? "POST /v1/identity/sessions" : activeStep === 2 ? "POST /v1/payments/authorize" : activeStep === 3 ? "POST /v1/bookings" : "POST /v1/ledger/reconcile"}</code></div>
          </motion.div>
        </div>
      </section>

      <section id="platform" className="section-pad ruled-section"><div className="container two-col"><Reveal><div className="section-intro"><div className="eyebrow"><i />The problem, made legible</div><h2>Complex travel operations should not require a patchwork of systems.</h2><p>Tripkopa brings provider behavior, customer identity, payment flexibility, and post-booking accountability into one controlled path.</p></div></Reveal><Reveal delay={0.08}><div className="fractures">{fractures.map((item) => <div className="fracture" key={item.number}><span className="outlined-index">{item.number}</span><div><h3>{item.problem}</h3><p>{item.control}</p></div></div>)}</div></Reveal></div></section>

      <section id="how-it-works" className="section-pad lifecycle-section"><div className="container"><Reveal><div className="section-heading"><div><div className="eyebrow"><i />A state machine, not a handoff chain</div><h2>From intent to settlement, every transition has a place.</h2></div><p>State names stay readable for product, finance, and operations teams.</p></div></Reveal><Reveal delay={0.08}><div className="lifecycle-panel"><div className="lifecycle-head"><span className="mono-label">AUDITABLE LIFECYCLE</span><span className="mono-label">7 STATES / CHRONOLOGICAL</span></div><div className="lifecycle-list">{lifecycle.map(([number, label, event], index) => <div className="life-step" key={number}><span className="life-number">{number}</span><div className="life-line"><span className="life-dot" />{index < lifecycle.length - 1 && <span className="life-connector" />}</div><div className="life-copy"><strong>{label}</strong><code>{event}</code></div></div>)}</div><div className="settled-note"><Check size={16} /><span><strong>Settled outcome</strong> — release, refund, or recover according to the recorded state and configured rules.</span></div></div></Reveal></div></section>

      <section className="section-pad domains-section"><div className="container domains-wrap"><Reveal><div className="section-intro"><div className="eyebrow"><i />Capability architecture</div><h2>Controls around the transaction.</h2><p>Four domains, one accountable system. Add what your product needs without giving up operational clarity.</p></div></Reveal><div className="domain-grid">{domains.map((domain, index) => { const Icon = domain.icon; return <Reveal key={domain.title} delay={index * 0.06}><article className="domain-card"><Icon size={22} strokeWidth={1.75} /><h3>{domain.title}</h3><p>{domain.copy}</p><div className="tag-row">{domain.tags.map(tag => <span key={tag}>{tag}</span>)}</div></article></Reveal>; })}</div></div></section>

      <section id="security" className="section-pad proof-section"><div className="container two-col proof-grid"><Reveal><div className="section-intro"><div className="eyebrow"><i />Proof surface</div><h2>Rules you can inspect. Events you can reconcile.</h2><p>Financially sensitive travel workflows need more than a successful response. Tripkopa makes versioned state, idempotent processing, and ledger outcomes visible.</p><ul className="proof-list"><li><span />Configurable rules stay separate from fulfillment state.</li><li><span />Signed provider events are verified before they move money.</li><li><span />Immutable double-entry records support reconciliation and recovery.</li></ul><button className="path-copy" onClick={copyPath}><Clipboard size={15} /><code>POST /v1/travel/quotes</code><span>{copied ? "Copied" : "Copy path"}</span></button></div></Reveal><Reveal delay={0.1}><div className="ledger-panel"><div className="ledger-top"><span className="mono-label">EVENT LEDGER / ILLUSTRATIVE</span><RefreshCw size={16} /></div><div className="ledger-columns"><span>EVENT</span><span>VERSION</span><span>STATUS</span></div>{ledgerRows.map(row => <div className="ledger-row" key={row.event}><div><strong>{row.event}</strong><small>{row.time}</small></div><code>{row.version}</code><Status state={row.state} /></div>)}<div className="ledger-foot"><span><i className="green-dot" />signature verified</span><span>redacted values</span></div></div></Reveal></div></section>

      <section id="integrations" className="section-pad integration-section"><div className="container integration-inner"><Reveal><div className="center-heading"><div className="eyebrow"><i />Integration posture</div><h2>Meet the stack you already operate.</h2><p>Tripkopa is designed to sit behind your customer experience, payment rails, identity provider, and flight fulfillment layer.</p></div></Reveal><div className="integration-grid">{integrations.map((integration, index) => { const Icon = integration.icon; return <Reveal key={integration.name} delay={index * 0.06}><Link href="/integrations" className="integration-tile"><Icon size={20} /><div><strong>{integration.name}</strong><span>{integration.role}</span></div><ArrowRight size={16} /></Link></Reveal>; })}</div><Reveal delay={0.14}><Link href="/signup" className="button button-primary">Discuss an integration <ArrowRight size={16} /></Link></Reveal></div></section>

      <section className="closing-section"><div className="container closing-inner"><Reveal><div className="eyebrow eyebrow-light"><i />Build the accountable path</div><h2>Make complex travel money movement feel executable.</h2><p>Bring your booking, payment, and operations teams one deterministic system to build against.</p><div className="hero-actions"><Link className="button button-inverted" href="/signup">Start building <ArrowRight size={16} /></Link><Link className="quiet-link light-link" href="/docs">Read documentation <ArrowRight size={15} /></Link></div></Reveal></div></section>

      <footer><div className="container footer-inner"><Link href="/" className="wordmark">Tripkopa</Link><span>Travel commerce infrastructure for accountable journeys.</span><span className="mono-label">© 2025 TRIPKOPA</span></div></footer>

      <style jsx global>{`
        :root { --paper:#F5F3EE; --surface:#FBFAF7; --ink:#18201F; --muted:#5F6966; --faint:#87908B; --rule:#D8D5CD; --accent:#B85C3B; --accent-dark:#98482F; --warm:#FFF8F0; --green:#3F6B58; --green-bg:#E5EEE8; --ochre:#806B32; --ochre-bg:#F1EBD8; --review:#93492F; --review-bg:#F4E4DC; --settled:#46504D; --settled-bg:#E7E8E3; }
        * { box-sizing:border-box; } html { scroll-behavior:smooth; } body { margin:0; background:var(--paper); color:var(--ink); font-family:Arial, Helvetica, sans-serif; } a { color:inherit; text-decoration:none; } button { font:inherit; } .container { width:100%; max-width:1180px; margin:0 auto; padding-left:56px; padding-right:56px; } .nav { height:72px; position:sticky; top:0; z-index:40; background:transparent; transition:background .15s,border-color .15s; border-bottom:1px solid transparent; } .nav-scrolled { background:rgba(245,243,238,.96); border-color:var(--rule); } .nav-inner { height:100%; display:flex; align-items:center; gap:28px; } .wordmark { font-size:18px; font-weight:600; letter-spacing:-.04em; color:var(--ink); } .nav-links { display:flex; gap:28px; margin-left:18px; font-size:14px; color:var(--muted); } .nav-links a,.text-button,.quiet-link,.footer-inner a { transition:color .15s; } .nav-links a:hover,.text-button:hover,.quiet-link:hover { color:var(--accent); } .nav-actions { display:flex; align-items:center; gap:12px; margin-left:auto; } .text-button { font-size:14px; padding:13px 8px; } .button { min-height:46px; display:inline-flex; align-items:center; justify-content:center; gap:10px; padding:0 20px; border:1px solid transparent; border-radius:4px; font-size:14px; font-weight:500; transition:background .15s,color .15s,border-color .15s; cursor:pointer; } .button-primary { color:var(--warm); background:var(--accent); border-color:var(--accent); } .button-primary:hover { background:var(--accent-dark); border-color:var(--accent-dark); } .menu-button { display:none; margin-left:auto; border:0; background:none; width:44px; height:44px; color:var(--ink); cursor:pointer; } .mobile-menu { display:none; overflow:hidden; background:var(--paper); border-bottom:1px solid var(--rule); } .section-pad { padding:112px 0; } .hero { min-height:680px; padding-top:108px; padding-bottom:96px; } .hero-copy { max-width:780px; } .eyebrow { display:flex; align-items:center; gap:10px; color:var(--accent); font:12px/1.2 var(--font-geist-mono),monospace; letter-spacing:.08em; text-transform:uppercase; } .eyebrow i { display:block; width:6px; height:6px; background:var(--accent); flex:none; } h1,h2,h3,p { margin:0; } h1,h2,h3 { font-weight:600; letter-spacing:-.04em; } h1 { max-width:780px; margin-top:20px; font-size:64px; line-height:.98; } h2 { font-size:40px; line-height:1.04; } h3 { font-size:20px; line-height:1.2; } p { color:var(--muted); font-size:18px; line-height:1.55; } .hero-sub { max-width:610px; margin-top:24px; font-size:19px; } .hero-actions { display:flex; align-items:center; gap:24px; margin-top:32px; } .quiet-link { display:inline-flex; gap:8px; align-items:center; font-size:14px; color:var(--ink); } .quiet-link:hover { text-decoration:underline; text-underline-offset:4px; } .flow-panel { margin-top:64px; background:var(--surface); border:1px solid var(--rule); border-radius:8px; overflow:hidden; } .flow-head,.lifecycle-head,.ledger-top { min-height:48px; display:flex; align-items:center; justify-content:space-between; padding:0 20px; border-bottom:1px solid var(--rule); } .mono-label,.flow-caption,.ledger-columns,.ledger-foot { font:11px/1.2 var(--font-geist-mono),monospace; letter-spacing:.07em; text-transform:uppercase; color:var(--faint); } .flow-rail { display:flex; align-items:stretch; padding:20px; } .flow-step { flex:1; display:flex; align-items:center; min-width:0; } .flow-step button { flex:1; display:flex; min-height:120px; padding:14px; flex-direction:column; align-items:flex-start; gap:8px; text-align:left; background:transparent; border:1px solid transparent; border-radius:4px; cursor:pointer; color:var(--ink); transition:border-color .15s,background .15s; } .flow-step button:hover,.flow-step.active button { border-color:#9EA59F; background:#F7F5F0; } .step-index,.outlined-index,.life-number { font:11px var(--font-geist-mono),monospace; color:var(--faint); } .flow-step strong { font-size:16px; font-weight:600; } .flow-step small { color:var(--muted); font-size:13px; } .connector { display:flex; align-items:center; justify-content:center; color:var(--faint); padding:0 7px; } .status { width:max-content; display:inline-flex; align-items:center; height:24px; padding:0 8px; border-radius:4px; font:11px/1 var(--font-geist-mono),monospace; text-transform:uppercase; } .status-ready,.status-verified { color:var(--green); background:var(--green-bg); } .status-pending { color:var(--ochre); background:var(--ochre-bg); } .status-review { color:var(--review); background:var(--review-bg); } .status-settled { color:var(--settled); background:var(--settled-bg); } .flow-detail { border-top:1px solid var(--rule); display:flex; gap:14px; align-items:center; padding:14px 20px; font-size:13px; color:var(--muted); } .flow-detail strong { color:var(--ink); font-size:14px; } code { font-family:var(--font-geist-mono),monospace; font-size:12px; color:var(--muted); } .flow-detail code { margin-left:auto; color:var(--accent); } .ruled-section { border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); } .two-col { display:grid; grid-template-columns:minmax(0, .92fr) minmax(0, 1.08fr); gap:80px; align-items:start; } .section-intro h2 { margin-top:20px; max-width:510px; } .section-intro p { max-width:570px; margin-top:24px; } .fractures { border-top:1px solid var(--rule); } .fracture { display:grid; grid-template-columns:48px 1fr; gap:16px; padding:22px 0; border-bottom:1px solid var(--rule); } .outlined-index { width:30px; height:24px; border:1px solid #B8B8AF; display:flex; justify-content:center; align-items:center; color:var(--ink); } .fracture h3 { font-size:18px; letter-spacing:-.02em; } .fracture p { font-size:15px; margin-top:8px; max-width:480px; } .lifecycle-section { padding-top:0; } .section-heading { display:flex; justify-content:space-between; gap:40px; align-items:end; margin-bottom:32px; } .section-heading h2 { margin-top:20px; max-width:660px; } .section-heading > p { max-width:260px; font-size:15px; } .lifecycle-panel { background:var(--surface); border:1px solid var(--rule); border-radius:8px; } .lifecycle-list { display:grid; grid-template-columns:repeat(7,1fr); padding:30px 24px 26px; } .life-step { min-width:0; position:relative; display:grid; grid-template-rows:24px 30px auto; } .life-number { color:var(--accent); } .life-line { position:relative; display:flex; align-items:center; } .life-dot { width:9px; height:9px; border:1px solid var(--accent); background:var(--surface); z-index:1; } .life-step:first-child .life-dot { background:var(--accent); } .life-connector { position:absolute; left:9px; right:0; top:14px; height:1px; background:var(--rule); } .life-copy { padding-right:10px; } .life-copy strong { display:block; font-size:14px; line-height:1.3; } .life-copy code { display:block; margin-top:8px; font-size:10px; line-height:1.3; overflow-wrap:anywhere; } .settled-note { display:flex; gap:10px; align-items:center; border-top:1px solid var(--rule); padding:17px 24px; color:var(--muted); font-size:13px; } .settled-note svg { color:var(--green); flex:none; } .settled-note strong { color:var(--ink); font-weight:500; } .domains-section { border-bottom:1px solid var(--rule); } .domains-wrap { max-width:1068px; } .domains-wrap > .section-intro { margin-bottom:40px; } .domain-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; } .domain-card { padding:28px; border:1px solid var(--rule); border-radius:8px; background:var(--surface); transition:border-color .15s; } .domain-card:hover { border-color:#9EA59F; } .domain-card > svg { color:var(--accent); } .domain-card h3 { margin-top:22px; } .domain-card p { font-size:15px; margin-top:12px; max-width:400px; } .tag-row { display:flex; flex-wrap:wrap; gap:7px; margin-top:24px; } .tag-row span { padding:5px 7px; background:#EFEEE9; color:var(--faint); font:10px var(--font-geist-mono),monospace; letter-spacing:.05em; } .proof-section { background:var(--surface); } .proof-grid { align-items:center; } .proof-list { list-style:none; padding:0; margin:28px 0 24px; display:grid; gap:13px; } .proof-list li { display:flex; gap:10px; color:var(--ink); font-size:14px; line-height:1.45; } .proof-list li span { width:6px; height:6px; background:var(--accent); margin-top:6px; flex:none; } .path-copy { display:inline-flex; align-items:center; gap:10px; min-height:44px; border:1px solid #B8B8AF; border-radius:4px; padding:0 12px; background:transparent; cursor:pointer; color:var(--ink); transition:border-color .15s,color .15s; } .path-copy:hover { border-color:var(--accent); color:var(--accent); } .path-copy span { color:var(--faint); font-size:12px; margin-left:4px; } .ledger-panel { border:1px solid var(--rule); border-radius:8px; overflow:hidden; background:var(--paper); } .ledger-top { color:var(--ink); } .ledger-top svg { color:var(--faint); } .ledger-columns { display:grid; grid-template-columns:1fr 74px 72px; padding:14px 20px 8px; font-size:10px; } .ledger-row { display:grid; grid-template-columns:1fr 74px 72px; align-items:center; padding:14px 20px; border-top:1px solid var(--rule); gap:8px; } .ledger-row strong { display:block; font:13px var(--font-geist-mono),monospace; font-weight:400; } .ledger-row small { display:block; color:var(--faint); font:10px var(--font-geist-mono),monospace; margin-top:5px; } .ledger-row code { font-size:11px; } .ledger-foot { display:flex; justify-content:space-between; padding:15px 20px; border-top:1px solid var(--rule); font-size:10px; } .ledger-foot span { display:flex; align-items:center; gap:7px; } .green-dot { width:6px; height:6px; border-radius:50%; background:var(--green); } .integration-section { text-align:center; } .integration-inner { max-width:980px; display:flex; flex-direction:column; align-items:center; } .center-heading { max-width:640px; } .center-heading h2 { margin-top:20px; } .center-heading p { margin-top:20px; font-size:17px; } .integration-grid { width:100%; display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin:44px 0 32px; text-align:left; } .integration-tile { display:flex; align-items:center; gap:14px; min-height:80px; padding:18px 20px; border:1px solid var(--rule); background:var(--surface); border-radius:8px; transition:border-color .15s,color .15s; } .integration-tile:hover { border-color:#9EA59F; } .integration-tile > svg:first-child { color:var(--accent); flex:none; } .integration-tile div { flex:1; } .integration-tile strong,.integration-tile span { display:block; } .integration-tile strong { font-size:15px; font-weight:500; } .integration-tile span { color:var(--muted); font-size:13px; margin-top:5px; } .integration-tile > svg:last-child { color:var(--faint); } .closing-section { background:var(--ink); color:var(--paper); } .closing-inner { max-width:860px; text-align:center; padding-top:128px; padding-bottom:136px; display:flex; flex-direction:column; align-items:center; } .eyebrow-light { color:#C86B48; } .closing-inner h2 { max-width:700px; margin-top:20px; color:var(--paper); } .closing-inner p { max-width:560px; margin-top:20px; color:#B9BFBA; font-size:17px; } .button-inverted { background:#C86B48; border-color:#C86B48; color:#FFF8F0; } .button-inverted:hover { background:#B85C3B; border-color:#B85C3B; } .light-link { color:var(--paper); } footer { border-top:1px solid #343B39; background:var(--ink); color:#AAB2AD; } .footer-inner { min-height:82px; display:flex; align-items:center; gap:28px; font-size:12px; } footer .wordmark { color:var(--paper); } footer .mono-label { margin-left:auto; color:#7D8781; font-size:10px; }
        :focus-visible { outline:2px solid var(--accent); outline-offset:2px; } @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; transition-duration:0.01ms !important; animation-duration:0.01ms !important; } }
        @media (max-width:1279px) { .container { padding-left:40px; padding-right:40px; } h1 { font-size:54px; } }
        @media (max-width:1023px) { .nav-links,.nav-actions { display:none; } .menu-button { display:block; } .mobile-menu { display:block; } .mobile-menu-inner { display:grid; gap:2px; padding-top:12px; padding-bottom:18px; } .mobile-menu-inner a { min-height:44px; display:flex; align-items:center; font-size:15px; color:var(--muted); } .mobile-menu-inner .button { display:inline-flex; width:max-content; margin-top:8px; color:var(--warm); } .section-pad { padding:88px 0; } .hero { padding-top:88px; } .flow-rail { padding:14px; } .flow-step button { padding:10px; } .flow-step small { font-size:12px; } .two-col { gap:48px; } .lifecycle-list { grid-template-columns:repeat(4,1fr); row-gap:28px; } .life-step:nth-child(4) .life-connector { display:none; } }
        @media (max-width:767px) { .container { padding-left:24px; padding-right:24px; } .nav { height:64px; } .section-pad { padding:72px 0; } .hero { min-height:620px; padding-top:72px; padding-bottom:64px; } h1 { font-size:46px; line-height:.98; } h2 { font-size:32px; } p { font-size:16px; } .hero-sub { font-size:17px; } .flow-panel { margin-top:40px; } .flow-head { padding:0 16px; } .flow-caption { display:none; } .flow-rail { display:block; padding:10px 16px 4px; } .flow-step { min-height:64px; } .flow-step button { min-height:62px; display:grid; grid-template-columns:25px 20px 1fr auto; align-items:center; gap:8px; padding:8px 0; border:0; border-bottom:1px solid var(--rule); border-radius:0; } .flow-step button:hover,.flow-step.active button { background:transparent; border-color:var(--rule); } .flow-step small { grid-column:3; grid-row:2; } .flow-step .status { grid-column:4; grid-row:1 / span 2; } .connector { display:none; } .flow-detail { flex-wrap:wrap; gap:8px 12px; padding:14px 16px; } .flow-detail code { width:100%; margin-left:0; overflow-wrap:anywhere; } .two-col { grid-template-columns:1fr; gap:42px; } .section-heading { display:block; margin-bottom:28px; } .section-heading > p { margin-top:20px; } .lifecycle-section { padding-top:0; } .lifecycle-list { display:block; padding:24px 20px 12px; } .life-step { display:grid; grid-template-columns:28px 24px 1fr; grid-template-rows:auto; min-height:62px; } .life-line { height:auto; align-items:start; justify-content:center; } .life-dot { margin-top:4px; } .life-connector { top:13px; bottom:-48px; left:4px; right:auto; width:1px; height:auto; } .life-copy { padding:0 0 22px; } .life-copy code { margin-top:5px; } .settled-note { align-items:flex-start; padding:16px 20px; } .domain-grid,.integration-grid { grid-template-columns:1fr; } .domain-card { padding:22px 20px; } .ledger-columns,.ledger-row { grid-template-columns:1fr 58px; } .ledger-columns span:last-child,.ledger-row .status { display:none; } .ledger-row { padding:14px 16px; } .ledger-top { padding:0 16px; } .ledger-columns { padding-left:16px; padding-right:16px; } .ledger-foot { padding:14px 16px; } .closing-inner { padding-top:80px; padding-bottom:80px; } .footer-inner { min-height:110px; flex-wrap:wrap; gap:10px 20px; padding-top:20px; padding-bottom:20px; } footer .mono-label { margin-left:0; width:100%; } }
        @media (prefers-color-scheme:dark) { :root { --paper:#202523; --surface:#262C29; --ink:#F1EEE8; --muted:#B4BCB6; --faint:#8B9690; --rule:#444D48; --warm:#FFF8F0; --green-bg:#294137; --ochre-bg:#49432B; --review-bg:#4D342B; --settled-bg:#39403D; } .nav-scrolled { background:rgba(32,37,35,.96); } .flow-step button:hover,.flow-step.active button { background:#2B312E; } .tag-row span { background:#303733; } .ledger-panel { background:#202523; } .closing-section,footer { background:#151A18; } }
      `}</style>
    </main>
  );
}
