"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import {
  createKycSessionsExchange,
  getKycSessionsBySessionId,
  postKycSessionsConsentBySessionId,
  verifyKycBvn,
} from "@/lib/api/client";
import type { KycBrowserSession, KycSession } from "@/lib/api-contracts";

type KycState =
  | "exchanging"
  | "expired"
  | "consent"
  | "launching"
  | "pending"
  | "verified"
  | "failed";

function isExpired(expiresAt: string) {
  return (
    Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()
  );
}

export default function KycVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [state, setState] = useState<KycState>("exchanging");
  const [consent, setConsent] = useState(false);
  const [bvn, setBvn] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<KycBrowserSession | KycSession | null>(
    null,
  );
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);

  useEffect(() => {
    let active = true;

    const exchangeToken = async () => {
      try {
        const { token } = await params;
        if (!token) {
          throw new Error("This verification link is invalid.");
        }

        const exchanged: KycBrowserSession = await createKycSessionsExchange({
          token,
        });
        if (!active) return;
        setSession(exchanged);

        if (isExpired(exchanged.expires_at)) {
          setState("expired");
          return;
        }

        const current: KycSession = await getKycSessionsBySessionId(
          exchanged.session_id,
        );
        if (!active) return;
        setSession(current);
        if (isExpired(current.expires_at)) {
          setState("expired");
        } else if (
          ["VERIFIED", "verified", "SUCCESS", "success"].includes(
            current.status,
          )
        ) {
          setState("verified");
        } else if (
          ["FAILED", "failed", "REJECTED", "rejected"].includes(current.status)
        ) {
          setState("failed");
        } else {
          setState("consent");
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "We could not validate this verification link.",
        );
        setState("expired");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void exchangeToken();
    return () => {
      active = false;
    };
  }, [params]);

  const startVerification = async () => {
    if (!consent) {
      setNotice("Please confirm your consent before continuing.");
      return;
    }
    if (!/^\d{11}$/.test(bvn)) {
      setNotice("Enter your 11-digit BVN.");
      return;
    }
    if (!session) return;
    const sessionId =
      "session_id" in session && typeof session.session_id === "string"
        ? session.session_id
        : "id" in session && typeof session.id === "string"
          ? session.id
          : null;
    if (!sessionId) {
      setNotice("The verification session is invalid.");
      return;
    }
    setState("launching");
    setNotice("");
    try {
      await postKycSessionsConsentBySessionId(sessionId);
      await verifyKycBvn(sessionId, { bvn });
      setState("verified");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setState("failed");
    } finally {
      setBvn("");
    }
  };

  const reset = () => {
    setConsent(false);
    setNotice("");
    setError("");
    setState("expired");
  };

  const statusLabel = session
    ? `Session ${session.session_id}`
    : "Session secured";

  return (
    <main className="kyc-page">
      <header className="kyc-header">
        <div className="kyc-wordmark">
          <span className="kyc-mark">t</span>tripkopa
        </div>
        <div className="kyc-secure">
          <LockKeyhole size={14} />
          Secure verification
        </div>
      </header>

      <div className="kyc-layout">
        <aside className="kyc-aside">
          <div className="kyc-aside-inner">
            <div className="kyc-eyebrow">
              <span />
              Identity verification
            </div>
            <h1>One clear step toward a smoother journey.</h1>
            <p>
              Verify your identity securely so Tripkopa can protect your account
              and support eligible travel-payment journeys.
            </p>
            <div className="kyc-assurance">
              <ShieldCheck size={18} />
              <div>
                <strong>Your information stays protected</strong>
                <span>
                  Identity details are handled by our verification provider and
                  are never shared through WhatsApp.
                </span>
              </div>
            </div>
            <div className="kyc-steps">
              <div className="done">
                <span>
                  <Check size={13} />
                </span>
                <div>
                  <strong>Secure session</strong>
                  <small>Link authenticated</small>
                </div>
              </div>
              <div
                className={
                  state === "consent" ||
                  state === "launching" ||
                  state === "pending"
                    ? "current"
                    : ""
                }
              >
                <span>2</span>
                <div>
                  <strong>Consent</strong>
                  <small>Review and approve</small>
                </div>
              </div>
              <div
                className={
                  state === "pending" || state === "verified" ? "current" : ""
                }
              >
                <span>3</span>
                <div>
                  <strong>Verification</strong>
                  <small>Provider review</small>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="kyc-panel">
          <div className="kyc-panel-inner">
            {isLoading && state === "exchanging" && (
              <div className="kyc-state centered">
                <div className="kyc-spinner">
                  <Timer size={23} />
                </div>
                <h2>Securing your session</h2>
                <p>We’re validating your one-time verification link.</p>
                <small>
                  Your link is opaque and never contains identity details.
                </small>
              </div>
            )}

            {state === "expired" && !isLoading && (
              <div className="kyc-state centered">
                <div className="kyc-error-icon">
                  <X size={22} />
                </div>
                <h2>This link is no longer available</h2>
                <p>
                  {error ||
                    "For your security, verification links expire quickly and can only be used once."}
                </p>
                <div className="kyc-error-box">
                  <strong>No information was shared</strong>
                  <span>
                    Request a new link from the Tripkopa WhatsApp conversation
                    to continue.
                  </span>
                </div>
                <button className="kyc-primary-button" onClick={reset}>
                  <ArrowLeft size={16} />
                  Start again
                </button>
              </div>
            )}

            {state === "consent" && !isLoading && (
              <div className="kyc-state">
                <div className="kyc-panel-kicker">Step 2 of 3</div>
                <h2>Review and give consent</h2>
                <p className="kyc-lead">
                  Before verification begins, please review how your information
                  will be used.
                </p>
                <div className="kyc-notice">
                  <div className="kyc-notice-head">
                    <ShieldCheck size={18} />
                    <strong>Privacy notice · version 1.0</strong>
                  </div>
                  <p>
                    Tripkopa uses a trusted identity verification provider to
                    confirm the identity associated with your authenticated
                    account. We collect only the verification result and limited
                    reference information needed to provide booking and payment
                    services.
                  </p>
                  <ul>
                    <li>
                      Identity documents are handled directly by the
                      verification provider where supported.
                    </li>
                    <li>
                      Your verification status may be used to determine access
                      to certain payment options.
                    </li>
                    <li>
                      You can request help or ask questions through the Tripkopa
                      WhatsApp conversation.
                    </li>
                  </ul>
                  <button
                    className="kyc-text-link"
                    onClick={() => setShowPrivacyNotice((visible) => !visible)}
                  >
                    Read the full privacy notice <ExternalLink size={14} />
                  </button>
                  {showPrivacyNotice && (
                    <p role="note">
                      The privacy notice shown here applies to this verification
                      session.
                    </p>
                  )}
                </div>
                <label className="kyc-checkbox">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => {
                      setConsent(event.target.checked);
                      setNotice("");
                    }}
                  />
                  <span className="kyc-checkmark">
                    {consent && <Check size={14} />}
                  </span>
                  <span>
                    I consent to identity verification and the processing
                    described above.
                  </span>
                </label>
                <label className="kyc-field">
                  <span>Bank Verification Number</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={11}
                    value={bvn}
                    onChange={(event) => {
                      setBvn(event.target.value.replace(/\D/g, ""));
                      setNotice("");
                    }}
                    placeholder="11-digit BVN"
                  />
                  <small>Your BVN is verified securely and is not stored by Tripkopa.</small>
                </label>
                {notice && (
                  <div className="kyc-inline-error" role="alert">
                    {notice}
                  </div>
                )}
                <button
                  className="kyc-primary-button"
                  onClick={startVerification}
                  disabled={!consent || bvn.length !== 11}
                >
                  Continue to verification <ChevronRight size={17} />
                </button>
                <p className="kyc-footnote">
                  {statusLabel}. Consent will be recorded before provider
                  launch.
                </p>
              </div>
            )}

            {(state === "launching" || state === "pending") && (
              <div className="kyc-state centered">
                <div className="kyc-spinner">
                  <ShieldCheck size={23} />
                </div>
                <h2>Verification in progress</h2>
                <p>
                  We’ve received your session and are waiting for the provider
                  flow.
                </p>
                <div className="kyc-pending-card">
                  <div>
                    <span className="kyc-pulse" />
                    <strong>Status pending</strong>
                  </div>
                  <span>{statusLabel}</span>
                </div>
              </div>
            )}

            {(state === "verified" || state === "failed") && (
              <div className="kyc-state centered">
                <div
                  className={
                    state === "verified" ? "kyc-success-icon" : "kyc-error-icon"
                  }
                >
                  {state === "verified" ? <Check size={23} /> : <X size={23} />}
                </div>
                <h2>
                  {state === "verified"
                    ? "Verification complete"
                    : "Verification could not be completed"}
                </h2>
                <p>
                  {state === "verified"
                    ? "Your status is ready to be shared securely with Tripkopa."
                    : "Please request a new verification link through the Tripkopa WhatsApp conversation."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="kyc-footer">
        <span>© 2026 Tripkopa</span>
        <span>Privacy by design</span>
        <span>Need help? Return to WhatsApp</span>
      </footer>
    </main>
  );
}
