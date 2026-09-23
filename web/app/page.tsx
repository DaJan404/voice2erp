"use client";

import { useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

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

function isVerificationResponse(value: unknown): value is VerificationResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "status" in value && value.status === "verified";
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [verification, setVerification] =
    useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") {
      setTheme(current);
    }
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("voice2erp-theme", nextTheme);
    setTheme(nextTheme);
  }

  async function verifyLive() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/verify/customer?query=10000", {
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok || !isVerificationResponse(data)) {
        throw new Error("Live verification failed. Please try again.");
      }

      setVerification(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Live verification failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const customer = verification?.briefing.customer;
  const sales = verification?.briefing.sales;
  const currency = customer?.currency ?? "USD";

  const activity = useMemo(() => {
    if (loading) {
      return {
        label: "Querying live ERP data",
        detail: "A fresh server-side request is in progress.",
        state: "working" as const,
      };
    }

    if (verification) {
      return {
        label: "ERP evidence matched",
        detail:
          "The values shown were fetched independently from Business Central.",
        state: "verified" as const,
      };
    }

    return {
      label: "Ready for the agent",
      detail:
        "The voice flow is validated. Browser voice controls are the next integration step.",
      state: "idle" as const,
    };
  }, [loading, verification]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="VOICE2ERP home">
          <span className="brand-mark" aria-hidden="true">
            V2
          </span>
          <span>
            <strong>VOICE2ERP</strong>
            <small>Talk. Confirm. Execute. Verify.</small>
          </span>
        </a>

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
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
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
                className="primary-action"
                type="button"
                onClick={verifyLive}
                disabled={loading}
              >
                {loading ? "Verifying live data" : "Verify live ERP data"}
                <ArrowIcon />
              </button>
              <span className="action-note">
                Customer 10000, Adatum Corporation
              </span>
            </div>
          </div>

          <div className="voice-signal" aria-hidden="true">
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

          <p className="voice-caption">
            AssemblyAI voice agent, Cloudflare integration, Business Central
            source of truth
          </p>
        </section>

        <section className="evidence-panel" aria-labelledby="evidence-title">
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
                "verification-state" + (verification ? " is-verified" : "")
              }
              aria-live="polite"
            >
              <span aria-hidden="true">{verification ? "✓" : "○"}</span>
              {verification ? "Verified live" : "Not verified yet"}
            </div>
          </div>

          {!verification ? (
            <div className="evidence-empty">
              <div className="evidence-empty-rule" aria-hidden="true" />
              <p>
                The AI response is not the proof. This view performs a separate,
                uncached Business Central request and displays the result as
                source evidence.
              </p>
              <button
                className="secondary-action"
                type="button"
                onClick={verifyLive}
                disabled={loading}
              >
                {loading
                  ? "Checking Business Central"
                  : "Run live verification"}
              </button>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="evidence-content reveal">
              <div className="primary-metric">
                <span className="metric-label">Open order value</span>
                <strong>
                  {money(sales?.open_order_value ?? 0, currency)}
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
                    {money(sales?.open_quote_value ?? 0, currency)}
                  </strong>
                </div>
                <div>
                  <span>Balance due</span>
                  <strong>
                    {money(customer?.balance_due ?? 0, currency)}
                  </strong>
                </div>
              </div>

              <dl className="evidence-meta">
                <div>
                  <dt>Source</dt>
                  <dd>{verification.verification.source_name}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{verification.verification.environment}</dd>
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
                  onClick={verifyLive}
                  disabled={loading}
                >
                  {loading ? "Verifying" : "Verify again"}
                </button>
                <span>
                  Every verification triggers a new Business Central API request.
                </span>
              </div>

              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="activity-panel" aria-labelledby="activity-title">
          <div>
            <p className="section-kicker" id="activity-title">
              Live activity
            </p>
            <div
              className={"activity-status activity-" + activity.state}
              aria-live="polite"
            >
              <span className="activity-indicator" aria-hidden="true" />
              <div>
                <strong>{activity.label}</strong>
                <p>{activity.detail}</p>
              </div>
            </div>
          </div>

          <ol className="flow-list" aria-label="VOICE2ERP request flow">
            <FlowStep number="01" label="Listen" detail="Natural voice request" />
            <FlowStep
              number="02"
              label="Understand"
              detail="Customer and intent"
            />
            <FlowStep
              number="03"
              label="Query ERP"
              detail="Business Central API"
              active={loading}
            />
            <FlowStep
              number="04"
              label="Verify"
              detail="Independent source proof"
              complete={Boolean(verification)}
            />
          </ol>
        </aside>

        <section className="orders-panel" aria-labelledby="orders-title">
          <div className="orders-heading">
            <div>
              <p className="section-kicker">Business context</p>
              <h2 id="orders-title">Order signal</h2>
            </div>
            <p>
              Current operational context from the same verified customer
              record.
            </p>
          </div>

          <div className="order-composition">
            <OrderRecord
              label="Latest order"
              order={sales?.latest_order ?? null}
              currency={currency}
            />
            <div className="order-divider" aria-hidden="true" />
            <OrderRecord
              label="Largest order"
              order={sales?.largest_order ?? null}
              currency={currency}
              detail={
                sales?.largest_order?.lines?.[0]
                  ? String(sales.largest_order.lines[0].quantity) +
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
      <span className="flow-number">{complete ? "✓" : number}</span>
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
          <div className="record-value">{money(order.total, currency)}</div>
          <div className="record-meta">
            <span className="mono">{order.order_date}</span>
            {detail && <span>{detail}</span>}
          </div>
        </>
      ) : (
        <p className="record-empty">Run verification to load this record.</p>
      )}
    </article>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
