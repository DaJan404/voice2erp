"use client";

import { useState } from "react";

type OrderSummary = {
  number: string;
  order_date: string;
  status: string;
  currency: string;
  total: number;
  fully_shipped: boolean;
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
      largest_order:
        | (OrderSummary & {
            lines: Array<{
              item_number: string;
              description: string;
              quantity: number;
              unit_price: number;
              total: number;
              shipped_quantity: number;
            }>;
          })
        | null;
      recent_orders: OrderSummary[];
    };
  };
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function Home() {
  const [verification, setVerification] =
    useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyLive() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/verify/customer?query=10000",
        { cache: "no-store" },
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error("Live verification failed.");
      }

      setVerification(data as VerificationResponse);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Live verification failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const customer = verification?.briefing.customer;
  const sales = verification?.briefing.sales;
  const currency = customer?.currency ?? "USD";

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <span className="text-sm font-semibold tracking-tight">V2</span>
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.02em]">
                VOICE2ERP
              </div>
              <div className="text-xs text-white/38">
                Talk. Confirm. Execute. Verify.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
            Business Central connected
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div className="flex min-h-[560px] flex-col justify-between rounded-[32px] border border-white/8 bg-white/[0.025] p-7 sm:p-9">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-xs text-white/48">
                <span className="size-1.5 rounded-full bg-white/40" />
                Voice session ready
              </div>

              <h1 className="max-w-2xl text-4xl font-medium leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                Speak to your ERP.
                <span className="block text-white/34">
                  Verify every answer.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/45">
                A voice-first operating layer for Microsoft Dynamics 365
                Business Central. Live ERP data stays independently
                verifiable — outside the model response.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center py-10">
              <div className="voice-orb-shell">
                <div className="voice-orb-ring voice-orb-ring-one" />
                <div className="voice-orb-ring voice-orb-ring-two" />
                <div className="voice-orb">
                  <div className="voice-orb-core" />
                </div>
              </div>

              <div className="mt-8 text-center">
                <div className="text-sm font-medium text-white/76">
                  Voice layer next
                </div>
                <div className="mt-1 text-xs text-white/32">
                  AssemblyAI agent is already validated end-to-end
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-white/8 pt-5 text-xs">
              <div>
                <div className="text-white/28">Voice</div>
                <div className="mt-1 text-white/65">AssemblyAI</div>
              </div>
              <div>
                <div className="text-white/28">Integration</div>
                <div className="mt-1 text-white/65">Cloudflare</div>
              </div>
              <div>
                <div className="text-white/28">ERP</div>
                <div className="mt-1 text-white/65">Business Central</div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/8 bg-[#0c0f14] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.17em] text-white/36">
                  <span className="size-1.5 rounded-full bg-cyan-300" />
                  Live ERP Evidence
                </div>
                <h2 className="mt-3 text-2xl font-medium tracking-[-0.035em]">
                  {customer?.name ?? "Business Central verification"}
                </h2>
                <p className="mt-1 text-sm text-white/36">
                  {customer
                    ? `Customer ${customer.number} · ${customer.city}, ${customer.state}`
                    : "Fetch directly from the hackathon Business Central tenant."}
                </p>
              </div>

              {verification && (
                <div className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-300">
                  ✓ Verified live
                </div>
              )}
            </div>

            {!verification ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.035]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-6 text-white/56"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 7.5 12 3l8 4.5M4 7.5V17l8 4 8-4V7.5M4 7.5l8 4.5m8-4.5L12 12m0 9v-9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <div className="max-w-sm text-lg font-medium tracking-[-0.025em]">
                  Prove the data without trusting the AI.
                </div>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/36">
                  This triggers a new server-side request through the
                  VOICE2ERP verification path directly into Business Central.
                </p>

                <button
                  type="button"
                  onClick={verifyLive}
                  disabled={loading}
                  className="mt-7 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/88 disabled:cursor-wait disabled:opacity-60"
                >
                  {loading ? "Verifying…" : "Verify Adatum live"}
                </button>

                {error && (
                  <p className="mt-4 text-sm text-red-300">{error}</p>
                )}
              </div>
            ) : (
              <div className="mt-8">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 sm:grid-cols-4">
                  <Metric
                    label="Open orders"
                    value={String(sales?.open_orders ?? 0)}
                  />
                  <Metric
                    label="Order value"
                    value={money(sales?.open_order_value ?? 0, currency)}
                  />
                  <Metric
                    label="Open quotes"
                    value={String(sales?.open_quotes ?? 0)}
                  />
                  <Metric
                    label="Quote value"
                    value={money(sales?.open_quote_value ?? 0, currency)}
                  />
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <OrderCard
                    eyebrow="Latest order"
                    order={sales?.latest_order ?? null}
                    currency={currency}
                  />
                  <OrderCard
                    eyebrow="Largest order"
                    order={sales?.largest_order ?? null}
                    currency={currency}
                  />
                </div>

                <div className="mt-6 border-t border-white/8 pt-5">
                  <div className="grid gap-4 text-xs sm:grid-cols-2">
                    <EvidenceRow
                      label="Source"
                      value={verification.verification.source_name}
                    />
                    <EvidenceRow
                      label="Environment"
                      value={verification.verification.environment}
                    />
                    <EvidenceRow
                      label="Retrieved"
                      value={new Date(
                        verification.verification.retrieved_at,
                      ).toLocaleString()}
                    />
                    <EvidenceRow
                      label="Caching"
                      value="Disabled · fresh request"
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={verifyLive}
                      disabled={loading}
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/88 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loading ? "Verifying…" : "Verify again"}
                    </button>
                    <span className="text-xs text-white/28">
                      Fresh Business Central API request on every verification
                    </span>
                  </div>

                  {error && (
                    <p className="mt-4 text-sm text-red-300">{error}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0c0f14] px-4 py-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/28">
        {label}
      </div>
      <div className="mt-2 text-xl font-medium tracking-[-0.035em] text-white/88">
        {value}
      </div>
    </div>
  );
}

function OrderCard({
  eyebrow,
  order,
  currency,
}: {
  eyebrow: string;
  order: OrderSummary | null;
  currency: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/28">
        {eyebrow}
      </div>
      {order ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="font-mono text-sm text-white/78">
              {order.number}
            </div>
            <div className="rounded-full border border-white/8 px-2 py-1 text-[10px] text-white/38">
              {order.status}
            </div>
          </div>
          <div className="mt-5 text-2xl font-medium tracking-[-0.04em]">
            {money(order.total, currency)}
          </div>
          <div className="mt-1 text-xs text-white/30">
            {order.order_date}
          </div>
        </>
      ) : (
        <div className="mt-3 text-sm text-white/30">No order available</div>
      )}
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/26">{label}</div>
      <div className="mt-1 text-white/58">{value}</div>
    </div>
  );
}
