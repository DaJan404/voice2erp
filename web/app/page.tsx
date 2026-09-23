"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  VoiceAgentSession,
  type VoiceSessionState,
} from "@/lib/voice-agent-session";

type OrderSummary = {
  number: string;
  order_date: string;
  status: string;
  currency: string;
  total: number;
  fully_shipped: boolean;
};

type LargestOrder = OrderSummary & {
  lines: Array<{
    item_number: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    shipped_quantity: number;
  }>;
};

type VerificationResponse = {
  status: "verified";
  verification: {
    source: string;
    source_name: string;
    environment: string;
    company_id: string;
    retrieved_at: string;
    fresh: boolean;
  };
  briefing: {
    source: string;
    customer: {
      number: string;
      name: string;
      city: string;
      state: string;
      country: string;
      email: string;
      balance_due: number;
      currency: string;
    };
    sales: {
      open_orders: number;
      open_order_value: number;
      open_quotes: number;
      open_quote_value: number;
      latest_order: OrderSummary | null;
      largest_order: LargestOrder | null;
      recent_orders: OrderSummary[];
    };
  };
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function isVerificationResponse(
  value: unknown,
): value is VerificationResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "status" in value && value.status === "verified";
}

function extractToolQuery(args: unknown): string | null {
  if (typeof args === "string") {
    try {
      return extractToolQuery(JSON.parse(args));
    } catch {
      return null;
    }
  }

  if (!args || typeof args !== "object" || !("query" in args)) {
    return null;
  }

  const query = args.query;
  return typeof query === "string" && query.trim()
    ? query.trim()
    : null;
}

const VOICE_LABELS: Record<
  VoiceSessionState,
  { label: string; detail: string }
> = {
  idle: {
    label: "Ready for a voice session",
    detail: "Start a session, then ask naturally for a customer briefing.",
  },
  connecting: {
    label: "Connecting voice session",
    detail: "Securing a short-lived token and preparing microphone audio.",
  },
  listening: {
    label: "Listening",
    detail: "VOICE2ERP is ready for your next spoken request.",
  },
  understanding: {
    label: "Understanding request",
    detail: "The agent is resolving customer context and intent.",
  },
  querying: {
    label: "Querying Business Central",
    detail: "The agent called the live ERP tool for fresh source data.",
  },
  speaking: {
    label: "Speaking",
    detail: "VOICE2ERP is returning the Business Central result by voice.",
  },
  error: {
    label: "Voice session needs attention",
    detail: "Review the message below and start a fresh session.",
  },
};

export default function Home() {
  const voiceSessionRef = useRef<VoiceAgentSession | null>(null);

  const [verification, setVerification] =
    useState<VerificationResponse | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] =
    useState<string | null>(null);

  const [voiceState, setVoiceState] =
    useState<VoiceSessionState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
    };
  }, []);

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("voice2erp-theme", nextTheme);
  }

  async function verifyLive(query = "10000") {
    setVerificationLoading(true);
    setVerificationError(null);

    try {
      const response = await fetch(
        "/api/verify/customer?query=" + encodeURIComponent(query),
        { cache: "no-store" },
      );
      const data: unknown = await response.json();

      if (!response.ok || !isVerificationResponse(data)) {
        throw new Error("Live verification failed. Please try again.");
      }

      setVerification(data);
    } catch (caught) {
      setVerificationError(
        caught instanceof Error
          ? caught.message
          : "Live verification failed. Please try again.",
      );
    } finally {
      setVerificationLoading(false);
    }
  }

  async function startVoiceSession() {
    if (
      voiceState !== "idle" &&
      voiceState !== "error" &&
      voiceState !== "connecting"
    ) {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      return;
    }

    if (voiceState === "connecting") {
      return;
    }

    setVoiceError(null);
    setUserTranscript("");
    setAgentTranscript("");

    const session = new VoiceAgentSession({
      onStateChange: (state) => {
        setVoiceState(state);

        if (state === "idle" || state === "error") {
          voiceSessionRef.current = null;
        }
      },
      onTranscript: (speaker, text) => {
        if (speaker === "user") {
          setUserTranscript(text);
        } else {
          setAgentTranscript(text);
        }
      },
      onToolCall: (name, args) => {
        if (name !== "get_customer_briefing") {
          return;
        }

        const query = extractToolQuery(args);
        if (query) {
          void verifyLive(query);
        }
      },
      onError: (message) => {
        setVoiceError(message);
      },
    });

    voiceSessionRef.current = session;
    await session.start();
  }

  const customer = verification?.briefing.customer;
  const sales = verification?.briefing.sales;
  const currency = customer?.currency ?? "USD";

  const voiceIsRunning =
    voiceState !== "idle" &&
    voiceState !== "error" &&
    voiceState !== "connecting";

  const activity = useMemo(() => {
    if (voiceState !== "idle") {
      return {
        ...VOICE_LABELS[voiceState],
        state:
          voiceState === "error"
            ? ("error" as const)
            : voiceState === "querying" ||
                voiceState === "connecting"
              ? ("working" as const)
              : voiceState === "speaking"
                ? ("speaking" as const)
                : ("voice" as const),
      };
    }

    if (verificationLoading) {
      return {
        label: "Querying live ERP data",
        detail: "A fresh independent verification request is in progress.",
        state: "working" as const,
      };
    }

    if (verification) {
      return {
        label: "ERP evidence matched",
        detail:
          "The source data was fetched independently from Business Central.",
        state: "verified" as const,
      };
    }

    return {
      ...VOICE_LABELS.idle,
      state: "idle" as const,
    };
  }, [verification, verificationLoading, voiceState]);

  const buttonLabel =
    voiceState === "connecting"
      ? "Connecting"
      : voiceIsRunning
        ? "End voice session"
        : "Start voice session";

  const currentVerifyQuery = customer?.number ?? "10000";

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="VOICE2ERP home">
          <span className="brand-mark" aria-hidden="true">
            V2
          </span>
          <span>
            <strong>VOICE2ERP</strong>
            <small>Talk. Confirm. Execute. Verify.</small>
          </span>
        </Link>

        <div className="topbar-actions">
          <div
            className="connection-state"
            aria-label="Business Central connected"
          >
            <span className="connection-dot" aria-hidden="true" />
            <span className="connection-copy">BC live</span>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            <span className="theme-icon theme-icon-sun">
              <SunIcon />
            </span>
            <span className="theme-icon theme-icon-moon">
              <MoonIcon />
            </span>
          </button>
        </div>
      </header>

      <main className="product-grid">
        <section className="hero-panel" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="section-kicker">Voice-native ERP operations</p>
            <h1 id="hero-title">
              Talk to your ERP.
              <span>Verify every answer.</span>
            </h1>
            <p className="hero-subtext">
              Live Microsoft Business Central data, spoken naturally and
              verified independently.
            </p>

            <div className="hero-actions">
              <button
                className={
                  "primary-action" +
                  (voiceIsRunning ? " is-live" : "")
                }
                type="button"
                onClick={() => void startVoiceSession()}
                disabled={voiceState === "connecting"}
                aria-pressed={voiceIsRunning}
              >
                {buttonLabel}
                {voiceIsRunning ? <StopIcon /> : <ArrowIcon />}
              </button>
              <span className="action-note">
                Try: “Brief me on Adatum Corporation.”
              </span>
            </div>

            {voiceError && (
              <p className="voice-error" role="alert">
                {voiceError}
              </p>
            )}
          </div>

          <div
            className={
              "voice-signal voice-signal-" + voiceState
            }
            aria-hidden="true"
          >
            <span style={{ height: "28%" }} />
            <span style={{ height: "58%" }} />
            <span style={{ height: "86%" }} />
            <span style={{ height: "44%" }} />
            <span style={{ height: "72%" }} />
            <span style={{ height: "34%" }} />
            <span style={{ height: "62%" }} />
            <span style={{ height: "91%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "38%" }} />
            <span style={{ height: "68%" }} />
            <span style={{ height: "46%" }} />
          </div>

          <div className="transcript-rail" aria-live="polite">
            <div className="transcript-row">
              <span className="transcript-speaker">You</span>
              <p>
                {userTranscript ||
                  "Your spoken request will appear here."}
              </p>
            </div>
            <div className="transcript-row">
              <span className="transcript-speaker">VOICE2ERP</span>
              <p>
                {agentTranscript ||
                  "The agent response will appear here as it speaks."}
              </p>
            </div>
          </div>

          <p className="voice-caption">
            AssemblyAI voice session, Cloudflare integration, Business
            Central source of truth
          </p>
        </section>

        <section
          className="evidence-panel"
          aria-labelledby="evidence-title"
        >
          <div className="evidence-heading">
            <div>
              <p className="section-kicker">Live ERP evidence</p>
              <h2 id="evidence-title">
                {customer?.name ?? "Independent verification"}
              </h2>
              <p className="evidence-subtitle">
                {customer
                  ? "Customer " +
                    customer.number +
                    ", " +
                    customer.city +
                    ", " +
                    customer.state
                  : "Fetch the source record directly from Business Central."}
              </p>
            </div>

            <div
              className={
                "verification-state" +
                (verification ? " is-verified" : "")
              }
              aria-live="polite"
            >
              <span aria-hidden="true">
                {verification ? "✓" : "○"}
              </span>
              {verification ? "Verified live" : "Not verified yet"}
            </div>
          </div>

          {!verification ? (
            <div className="evidence-empty">
              <div
                className="evidence-empty-rule"
                aria-hidden="true"
              />
              <p>
                The AI response is not the proof. This view performs a
                separate, uncached Business Central request and displays
                the result as source evidence.
              </p>
              <button
                className="secondary-action"
                type="button"
                onClick={() => void verifyLive("10000")}
                disabled={verificationLoading}
              >
                {verificationLoading
                  ? "Checking Business Central"
                  : "Run live verification"}
              </button>
              {verificationError && (
                <p className="error-message" role="alert">
                  {verificationError}
                </p>
              )}
            </div>
          ) : (
            <div className="evidence-content reveal">
              <div className="primary-metric">
                <span className="metric-label">
                  Open order value
                </span>
                <strong>
                  {money(
                    sales?.open_order_value ?? 0,
                    currency,
                  )}
                </strong>
                <span className="metric-support">
                  {sales?.open_orders ?? 0} open orders,{" "}
                  {sales?.open_quotes ?? 0} open quotes
                </span>
              </div>

              <div
                className="secondary-metrics"
                aria-label="Business Central metrics"
              >
                <div>
                  <span>Quote value</span>
                  <strong>
                    {money(
                      sales?.open_quote_value ?? 0,
                      currency,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Balance due</span>
                  <strong>
                    {money(
                      customer?.balance_due ?? 0,
                      currency,
                    )}
                  </strong>
                </div>
              </div>

              <dl className="evidence-meta">
                <div>
                  <dt>Source</dt>
                  <dd>
                    {verification.verification.source_name}
                  </dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>
                    {verification.verification.environment}
                  </dd>
                </div>
                <div>
                  <dt>Retrieved</dt>
                  <dd>
                    {new Date(
                      verification.verification.retrieved_at,
                    ).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Cache</dt>
                  <dd>Disabled, fresh request</dd>
                </div>
              </dl>

              <div className="evidence-footer">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() =>
                    void verifyLive(currentVerifyQuery)
                  }
                  disabled={verificationLoading}
                >
                  {verificationLoading
                    ? "Verifying"
                    : "Verify again"}
                </button>
                <span>
                  Voice tool calls trigger the same independent
                  verification path automatically.
                </span>
              </div>

              {verificationError && (
                <p className="error-message" role="alert">
                  {verificationError}
                </p>
              )}
            </div>
          )}
        </section>

        <aside
          className="activity-panel"
          aria-labelledby="activity-title"
        >
          <div>
            <p className="section-kicker" id="activity-title">
              Live activity
            </p>
            <div
              className={
                "activity-status activity-" + activity.state
              }
              aria-live="polite"
            >
              <span
                className="activity-indicator"
                aria-hidden="true"
              />
              <div>
                <strong>{activity.label}</strong>
                <p>{activity.detail}</p>
              </div>
            </div>
          </div>

          <ol
            className="flow-list"
            aria-label="VOICE2ERP request flow"
          >
            <FlowStep
              number="01"
              label="Listen"
              detail="Natural voice request"
              active={voiceState === "listening"}
            />
            <FlowStep
              number="02"
              label="Understand"
              detail="Customer and intent"
              active={voiceState === "understanding"}
            />
            <FlowStep
              number="03"
              label="Query ERP"
              detail="Business Central API"
              active={
                voiceState === "querying" ||
                verificationLoading
              }
            />
            <FlowStep
              number="04"
              label="Verify"
              detail="Independent source proof"
              active={
                verificationLoading &&
                voiceState === "querying"
              }
              complete={Boolean(verification)}
            />
          </ol>
        </aside>

        <section
          className="orders-panel"
          aria-labelledby="orders-title"
        >
          <div className="orders-heading">
            <div>
              <p className="section-kicker">
                Business context
              </p>
              <h2 id="orders-title">Order signal</h2>
            </div>
            <p>
              Current operational context from the same verified
              customer record.
            </p>
          </div>

          <div className="order-composition">
            <OrderRecord
              label="Latest order"
              order={sales?.latest_order ?? null}
              currency={currency}
            />
            <div
              className="order-divider"
              aria-hidden="true"
            />
            <OrderRecord
              label="Largest order"
              order={sales?.largest_order ?? null}
              currency={currency}
              detail={
                sales?.largest_order?.lines?.[0]
                  ? String(
                      sales.largest_order.lines[0].quantity,
                    ) +
                    " x " +
                    sales.largest_order.lines[0].description
                  : undefined
              }
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function FlowStep({
  number,
  label,
  detail,
  active = false,
  complete = false,
}: {
  number: string;
  label: string;
  detail: string;
  active?: boolean;
  complete?: boolean;
}) {
  const className =
    "flow-step" +
    (active ? " is-active" : "") +
    (complete ? " is-complete" : "");

  return (
    <li className={className}>
      <span className="flow-number">
        {complete ? "✓" : number}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </li>
  );
}

function OrderRecord({
  label,
  order,
  currency,
  detail,
}: {
  label: string;
  order: OrderSummary | null;
  currency: string;
  detail?: string;
}) {
  return (
    <article className="order-record">
      <span className="record-label">{label}</span>
      {order ? (
        <>
          <div className="record-topline">
            <strong className="mono">{order.number}</strong>
            <span>{order.status}</span>
          </div>
          <div className="record-value">
            {money(order.total, currency)}
          </div>
          <div className="record-meta">
            <span className="mono">{order.order_date}</span>
            {detail && <span>{detail}</span>}
          </div>
        </>
      ) : (
        <p className="record-empty">
          Run verification to load this record.
        </p>
      )}
    </article>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3 3.9 3.9M20.1 20.1l-1.4-1.4M18.7 5.3l1.4-1.4M3.9 20.1l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 15.2A8.3 8.3 0 0 1 8.8 4a8.4 8.4 0 1 0 11.2 11.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h11m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="6"
        y="6"
        width="8"
        height="8"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}
