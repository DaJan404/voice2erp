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

type VerificationMetadata = {
  source: string;
  source_name: string;
  environment: string;
  company_id: string;
  retrieved_at: string;
  fresh: boolean;
};

type VerificationResponse = {
  status: "verified";
  verification: VerificationMetadata;
  briefing: {
    source: string;
    resolved_contact: {
      name: string;
      professional_title: string;
      email: string;
      phone: string;
    } | null;
    customer: {
      number: string;
      name: string;
      city: string;
      state: string;
      country: string;
      email: string;
      phone: string;
      website: string;
      balance_due: number;
      currency: string;
    };
    accounts_receivable: {
      open_invoice_count: number;
      open_invoice_value: number;
      overdue_invoice_count: number;
      overdue_value: number;
      balance_vs_open_invoices_difference: number;
      open_invoices_cover_balance: boolean;
      open_invoices: Array<{
        number: string;
        invoice_date: string;
        due_date: string;
        status: string;
        currency: string;
        total: number;
        remaining_amount: number;
        overdue: boolean;
        dispute_status: string;
      }>;
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

type AmbiguousVerificationResponse = {
  status: "ambiguous";
  verification: VerificationMetadata;
  query: string;
  customers: Array<{
    number: string;
    name: string;
    city: string;
  }>;
};

type NotFoundVerificationResponse = {
  status: "not_found";
  verification: VerificationMetadata;
  query: string;
};

type VerificationLookupResult =
  | AmbiguousVerificationResponse
  | NotFoundVerificationResponse;

type QuoteToolArgs = {
  customer_query: string;
  item_query: string;
  quantity: number;
};

type QuotePreviewResponse = {
  status: "prepared";
  preview: {
    customer: {
      number: string;
      name: string;
    };
    item: {
      number: string;
      description: string;
      unit_price: number;
      unit_of_measure: string;
      price_includes_tax: boolean;
    };
    quantity: number;
    reference_subtotal: number;
    currency: string;
    requires_confirmation: true;
    price_note: string;
  };
  confirmation_token: string;
  confirmation_expires_at: number;
};

type QuoteCreationResponse = {
  status: "created" | "existing";
  verification: VerificationMetadata;
  quote: {
    id: string;
    number: string;
    customer_number: string;
    customer_name: string;
    document_date: string;
    external_document_number: string;
    currency: string;
    total: number;
    status: string;
  };
  lines: Array<{
    item_number: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    unit_of_measure: string;
  }>;
};

type HistoryEntry = {
  id: number;
  kind: "user" | "agent" | "tool" | "verification" | "action";
  label: string;
  text: string;
  at: string;
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

function isAmbiguousVerificationResponse(
  value: unknown,
): value is AmbiguousVerificationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "ambiguous" &&
      "customers" in value &&
      Array.isArray(value.customers),
  );
}

function isNotFoundVerificationResponse(
  value: unknown,
): value is NotFoundVerificationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "not_found",
  );
}

function isQuotePreviewResponse(
  value: unknown,
): value is QuotePreviewResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "prepared" &&
      "preview" in value &&
      value.preview &&
      typeof value.preview === "object" &&
      "confirmation_token" in value &&
      typeof value.confirmation_token === "string" &&
      value.confirmation_token,
  );
}

function isQuoteCreationResponse(
  value: unknown,
): value is QuoteCreationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      (value.status === "created" || value.status === "existing") &&
      "quote" in value &&
      value.quote &&
      typeof value.quote === "object" &&
      "lines" in value &&
      Array.isArray(value.lines),
  );
}

function extractQuoteToolArgs(args: unknown): QuoteToolArgs | null {
  if (typeof args === "string") {
    try {
      return extractQuoteToolArgs(JSON.parse(args));
    } catch {
      return null;
    }
  }

  if (!args || typeof args !== "object") {
    return null;
  }

  if (
    !("customer_query" in args) ||
    !("item_query" in args) ||
    !("quantity" in args)
  ) {
    return null;
  }

  const customerQuery = args.customer_query;
  const itemQuery = args.item_query;
  const quantity =
    typeof args.quantity === "number"
      ? args.quantity
      : typeof args.quantity === "string"
        ? Number(args.quantity)
        : Number.NaN;

  if (
    typeof customerQuery !== "string" ||
    !customerQuery.trim() ||
    typeof itemQuery !== "string" ||
    !itemQuery.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return {
    customer_query: customerQuery.trim(),
    item_query: itemQuery.trim(),
    quantity,
  };
}

function responseDetail(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "detail" in value &&
    typeof value.detail === "string"
  ) {
    return value.detail;
  }

  if (
    value &&
    typeof value === "object" &&
    "status" in value &&
    typeof value.status === "string"
  ) {
    return value.status.replaceAll("_", " ");
  }

  return fallback;
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
  const historyCounterRef = useRef(0);

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
  const [customerQuery, setCustomerQuery] = useState("");
  const [lookupResult, setLookupResult] =
    useState<VerificationLookupResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  const [quotePreview, setQuotePreview] =
    useState<QuotePreviewResponse | null>(null);
  const [quoteResult, setQuoteResult] =
    useState<QuoteCreationResponse | null>(null);
  const [quoteRequestId, setQuoteRequestId] =
    useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteExecuting, setQuoteExecuting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.stop(false);
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

  function addHistory(
    kind: HistoryEntry["kind"],
    label: string,
    text: string,
  ) {
    const entry: HistoryEntry = {
      id: ++historyCounterRef.current,
      kind,
      label,
      text,
      at: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };

    setHistory((current) => [...current.slice(-39), entry]);
    setCopyStatus("");
  }

  async function copyText(text: string, successLabel = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successLabel);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  async function copySession() {
    const text = history
      .map(
        (entry) =>
          entry.at + " · " + entry.label + "\n" + entry.text,
      )
      .join("\n\n");

    await copyText(text, "Session copied");
  }

  async function verifyLive(query = "10000") {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setVerificationError("Enter a customer name or number.");
      return;
    }

    setVerificationLoading(true);
    setVerificationError(null);

    try {
      const response = await fetch(
        "/api/verify/customer?query=" +
          encodeURIComponent(normalizedQuery),
        { cache: "no-store" },
      );
      const data: unknown = await response.json();

      if (isVerificationResponse(data)) {
        setVerification(data);
        setLookupResult(null);
        setCustomerQuery(data.briefing.customer.number);
        addHistory(
          "verification",
          "Business Central",
          "Verified " +
            data.briefing.customer.name +
            " (" +
            data.briefing.customer.number +
            ") from live Business Central data.",
        );
        return;
      }

      if (isAmbiguousVerificationResponse(data)) {
        setVerification(null);
        setLookupResult(data);
        addHistory(
          "verification",
          "Business Central lookup",
          "Multiple customer records matched \"" +
            normalizedQuery +
            "\".",
        );
        return;
      }

      if (isNotFoundVerificationResponse(data)) {
        setVerification(null);
        setLookupResult(data);
        addHistory(
          "verification",
          "Business Central lookup",
          "No customer matched \"" + normalizedQuery + "\".",
        );
        return;
      }

      throw new Error(
        response.ok
          ? "Live verification returned an unexpected response."
          : "Live verification failed. Please try again.",
      );
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

  async function prepareQuote(args: QuoteToolArgs) {
    setQuoteLoading(true);
    setQuoteError(null);
    setQuoteResult(null);

    try {
      const response = await fetch("/api/quotes/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok || !isQuotePreviewResponse(data)) {
        throw new Error(
          responseDetail(data, "Could not prepare the sales quote."),
        );
      }

      setQuotePreview(data);
      setQuoteRequestId(crypto.randomUUID());

      addHistory(
        "action",
        "Quote prepared",
        String(data.preview.quantity) +
          " × " +
          data.preview.item.number +
          " " +
          data.preview.item.description +
          " for " +
          data.preview.customer.name +
          ". Awaiting human confirmation.",
      );
    } catch (caught) {
      setQuotePreview(null);
      setQuoteRequestId(null);
      setQuoteError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the sales quote.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  async function confirmQuote() {
    if (!quotePreview || !quoteRequestId || quoteExecuting) {
      return;
    }

    setQuoteExecuting(true);
    setQuoteError(null);

    try {
      const response = await fetch("/api/quotes/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation_token: quotePreview.confirmation_token,
          request_id: quoteRequestId,
        }),
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok || !isQuoteCreationResponse(data)) {
        throw new Error(
          responseDetail(data, "Could not create the sales quote."),
        );
      }

      setQuoteResult(data);

      addHistory(
        "action",
        "Business Central write",
        "Sales quote " +
          data.quote.number +
          " created and independently re-read from Business Central.",
      );

      const verifiedLine = data.lines[0];
      const spokenCurrency =
        data.quote.currency || quotePreview.preview.currency || "USD";

      voiceSessionRef.current?.requestReply(
        [
          "A human explicitly confirmed the sales quote in the interface.",
          "Business Central then created the quote and the application independently re-read it.",
          "Verified quote number:",
          data.quote.number + ".",
          "Customer:",
          data.quote.customer_name +
            " (" +
            data.quote.customer_number +
            ").",
          verifiedLine
            ? "Verified line: " +
              verifiedLine.quantity +
              " x " +
              verifiedLine.item_number +
              " " +
              verifiedLine.description +
              "."
            : "",
          "Verified total:",
          String(data.quote.total),
          spokenCurrency + ".",
          "Tell the user in one concise sentence that the quote was created and verified in Business Central.",
          "Do not change or invent any identifier, customer, quantity, amount, currency, or status.",
        ]
          .filter(Boolean)
          .join(" "),
      );

      void verifyLive(data.quote.customer_number);
    } catch (caught) {
      setQuoteError(
        caught instanceof Error
          ? caught.message
          : "Could not create the sales quote.",
      );

      voiceSessionRef.current?.requestReply(
        "The user explicitly confirmed the sales quote in the interface, but the Business Central write did not complete successfully. Tell the user in one concise sentence that the quote could not be created. Do not claim that any quote was created or verified.",
      );
    } finally {
      setQuoteExecuting(false);
    }
  }

  function cancelQuote() {
    if (quotePreview && !quoteResult) {
      addHistory(
        "action",
        "Quote cancelled",
        "Prepared sales quote was cancelled before any ERP write.",
      );

      voiceSessionRef.current?.requestReply(
        "The prepared sales quote was cancelled by the human before any ERP write. Tell the user in one concise sentence that the quote was cancelled and nothing was written to Business Central.",
      );
    }

    setQuotePreview(null);
    setQuoteResult(null);
    setQuoteRequestId(null);
    setQuoteError(null);
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
      onTranscript: (speaker, text, isFinal) => {
        if (speaker === "user") {
          setUserTranscript(text);
        } else {
          setAgentTranscript(text);
        }

        if (isFinal) {
          addHistory(
            speaker,
            speaker === "user" ? "You" : "VOICE2ERP",
            text,
          );
        }
      },
      onToolCall: (name, args) => {
        const serializedArgs =
          typeof args === "string"
            ? args
            : JSON.stringify(args ?? {});

        addHistory(
          "tool",
          "ERP tool",
          name + "(" + serializedArgs + ")",
        );

        if (name === "prepare_sales_quote") {
          const quoteArgs = extractQuoteToolArgs(args);

          if (quoteArgs) {
            void prepareQuote(quoteArgs);
          } else {
            setQuoteError("The voice agent returned an invalid quote request.");
          }

          return;
        }

        if (name === "get_customer_briefing") {
          const query = extractToolQuery(args);
          if (query) {
            setCustomerQuery(query);
            void verifyLive(query);
          }
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
  const resolvedContact = verification?.briefing.resolved_contact;
  const receivables = verification?.briefing.accounts_receivable;
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

    if (quoteExecuting) {
      return {
        label: "Creating sales quote",
        detail:
          "Human confirmation received. Business Central is writing and re-reading the quote.",
        state: "working" as const,
      };
    }

    if (quoteLoading) {
      return {
        label: "Preparing quote",
        detail:
          "Resolving the customer and item without writing to Business Central.",
        state: "working" as const,
      };
    }

    if (quoteResult) {
      return {
        label: "Quote created and verified",
        detail:
          "The new sales quote was re-read from Business Central after the write.",
        state: "verified" as const,
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
  }, [
    quoteExecuting,
    quoteLoading,
    quoteResult,
    verification,
    verificationLoading,
    voiceState,
  ]);

  const buttonLabel =
    voiceState === "connecting"
      ? "Connecting"
      : voiceIsRunning
        ? "End voice session"
        : "Start voice session";

  const currentVerifyQuery =
    customer?.number || customerQuery || "10000";

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
                Try: “Create a quote for Trey Research for 2 ATLANTA
                Whiteboards.”
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
                (verification && !verificationLoading
                  ? " is-verified"
                  : "")
              }
              aria-live="polite"
            >
              <span aria-hidden="true">
                {verificationLoading
                  ? "↻"
                  : verification
                    ? "✓"
                    : "○"}
              </span>
              {verificationLoading
                ? "Refreshing source"
                : verification
                  ? "Verified live"
                  : "Not verified yet"}
            </div>
          </div>

          <form
            className="customer-lookup"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyLive(customerQuery);
            }}
          >
            <label htmlFor="customer-query">Customer lookup</label>
            <div>
              <input
                id="customer-query"
                name="customerQuery"
                type="search"
                value={customerQuery}
                onChange={(event) =>
                  setCustomerQuery(event.target.value)
                }
                placeholder="Name or customer number"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={
                  verificationLoading || !customerQuery.trim()
                }
              >
                {verificationLoading ? "Checking" : "Verify customer"}
              </button>
            </div>
          </form>

          {!verification ? (
            lookupResult?.status === "ambiguous" ? (
              <div className="lookup-resolution reveal">
                <p className="section-kicker">Choose exact record</p>
                <h3>Multiple customers matched</h3>
                <p>
                  Select the Business Central record you want to verify.
                </p>
                <ul>
                  {lookupResult.customers.map((match) => (
                    <li key={match.number}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerQuery(match.number);
                          void verifyLive(match.number);
                        }}
                      >
                        <span>
                          <strong>{match.name}</strong>
                          <small>
                            {match.number}
                            {match.city ? ", " + match.city : ""}
                          </small>
                        </span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : lookupResult?.status === "not_found" ? (
              <div className="lookup-resolution reveal">
                <p className="section-kicker">No match</p>
                <h3>Customer not found</h3>
                <p>
                  No Business Central customer matched “{lookupResult.query}”.
                  Try the exact customer number or another name.
                </p>
              </div>
            ) : (
              <div className="evidence-empty">
                <div
                  className="evidence-empty-rule"
                  aria-hidden="true"
                />
                <p>
                  The AI response is not the proof. Verify any customer
                  directly against Business Central, or start a voice
                  session and let the tool call select the customer.
                </p>
              </div>
            )
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

              <dl
                className="customer-facts"
                aria-label="Customer record"
              >
                <div>
                  <dt>Customer no.</dt>
                  <dd className="mono">{customer?.number}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {resolvedContact?.name || "Not resolved from query"}
                    {resolvedContact?.professional_title ? (
                      <small>{resolvedContact.professional_title}</small>
                    ) : null}
                    {resolvedContact?.phone ? (
                      <small className="mono">{resolvedContact.phone}</small>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    {resolvedContact?.email || customer?.email ? (
                      <a
                        href={
                          "mailto:" +
                          (resolvedContact?.email || customer?.email)
                        }
                      >
                        {resolvedContact?.email || customer?.email}
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {[customer?.city, customer?.state, customer?.country]
                      .filter(Boolean)
                      .join(", ") || "Not provided"}
                  </dd>
                </div>
              </dl>

              <section
                className="receivables-section"
                aria-labelledby="receivables-title"
              >
                <div className="receivables-heading">
                  <div>
                    <span className="metric-label">Accounts receivable</span>
                    <h3 id="receivables-title">
                      {money(
                        receivables?.open_invoice_value ?? 0,
                        currency,
                      )}
                    </h3>
                    <p>
                      {receivables?.open_invoice_count ?? 0} open invoices
                      {receivables?.overdue_invoice_count
                        ? ", " +
                          receivables.overdue_invoice_count +
                          " overdue"
                        : ", none overdue"}
                    </p>
                  </div>
                  <div className="receivables-overdue">
                    <span>Overdue value</span>
                    <strong>
                      {money(receivables?.overdue_value ?? 0, currency)}
                    </strong>
                  </div>
                </div>

                {receivables?.open_invoices.length ? (
                  <ol className="receivable-list">
                    {receivables.open_invoices
                      .slice(0, 3)
                      .map((invoice) => (
                        <li key={invoice.number}>
                          <div>
                            <strong className="mono">
                              {invoice.number}
                            </strong>
                            <span>
                              Due {invoice.due_date || "not set"}
                              {invoice.overdue ? " · overdue" : ""}
                            </span>
                          </div>
                          <div>
                            <strong>
                              {money(
                                invoice.remaining_amount,
                                invoice.currency || currency,
                              )}
                            </strong>
                            <span>
                              {invoice.dispute_status ||
                                invoice.status ||
                                "Open"}
                            </span>
                          </div>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="receivables-empty">
                    No open invoice evidence was returned.
                  </p>
                )}

                {receivables &&
                !receivables.open_invoices_cover_balance ? (
                  <p className="receivables-note">
                    Open invoice evidence differs from the customer balance by{" "}
                    <strong>
                      {money(
                        receivables.balance_vs_open_invoices_difference,
                        currency,
                      )}
                    </strong>
                    . VOICE2ERP should not infer a cause from that difference.
                  </p>
                ) : null}
              </section>

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
              lines={sales?.largest_order?.lines}
            />
          </div>
        </section>

        {(quoteLoading ||
          quotePreview ||
          quoteResult ||
          quoteError) && (
          <section
            className="quote-panel reveal"
            aria-labelledby="quote-title"
          >
            <div className="quote-heading">
              <div>
                <p className="section-kicker">Human-in-the-loop action</p>
                <h2 id="quote-title">Sales quote confirmation</h2>
                <p>
                  VOICE2ERP can prepare the transaction. Only this
                  confirmation control is allowed to write it to Business
                  Central.
                </p>
              </div>

              <div
                className={
                  "quote-state" +
                  (quoteResult ? " is-verified" : "")
                }
                aria-live="polite"
              >
                <span aria-hidden="true">
                  {quoteExecuting
                    ? "↻"
                    : quoteResult
                      ? "✓"
                      : "○"}
                </span>
                {quoteExecuting
                  ? "Executing"
                  : quoteResult
                    ? "Created & verified"
                    : quoteLoading
                      ? "Preparing"
                      : "Awaiting confirmation"}
              </div>
            </div>

            {quotePreview && (
              <div className="quote-composition">
                <div className="quote-party">
                  <span className="record-label">Customer</span>
                  <strong>{quotePreview.preview.customer.name}</strong>
                  <small className="mono">
                    {quotePreview.preview.customer.number}
                  </small>
                </div>

                <div className="quote-line-preview">
                  <span className="record-label">Line</span>
                  <div>
                    <strong>
                      {quotePreview.preview.quantity} ×{" "}
                      {quotePreview.preview.item.description}
                    </strong>
                    <span className="mono">
                      {quotePreview.preview.item.number} ·{" "}
                      {quotePreview.preview.item.unit_of_measure}
                    </span>
                  </div>
                  <div>
                    <span>Reference unit price</span>
                    <strong>
                      {money(
                        quotePreview.preview.item.unit_price,
                        quotePreview.preview.currency || currency,
                      )}
                    </strong>
                  </div>
                </div>

                {!quoteResult ? (
                  <>
                    <div className="quote-reference">
                      <span>Reference item value</span>
                      <strong>
                        {money(
                          quotePreview.preview.reference_subtotal,
                          quotePreview.preview.currency || currency,
                        )}
                      </strong>
                      <p>{quotePreview.preview.price_note}</p>
                    </div>

                    <div className="quote-confirmation">
                      <div>
                        <strong>Nothing has been written yet.</strong>
                        <p>
                          Confirming creates a draft sales quote and then
                          re-reads it from Business Central.
                        </p>
                      </div>
                      <div>
                        <button
                          className="quote-cancel"
                          type="button"
                          onClick={cancelQuote}
                          disabled={quoteExecuting}
                        >
                          Cancel
                        </button>
                        <button
                          className="quote-confirm"
                          type="button"
                          onClick={() => void confirmQuote()}
                          disabled={quoteExecuting}
                        >
                          {quoteExecuting
                            ? "Creating in Business Central"
                            : "Confirm & create"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="quote-result">
                    <div>
                      <span className="record-label">
                        Business Central quote
                      </span>
                      <strong className="mono">
                        {quoteResult.quote.number}
                      </strong>
                      <small>
                        {quoteResult.quote.status} ·{" "}
                        {quoteResult.quote.document_date}
                      </small>
                    </div>
                    <div>
                      <span>Verified total</span>
                      <strong>
                        {money(
                          quoteResult.quote.total,
                          quoteResult.quote.currency || currency,
                        )}
                      </strong>
                      <small>
                        Re-read{" "}
                        {new Date(
                          quoteResult.verification.retrieved_at,
                        ).toLocaleString()}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={cancelQuote}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}

            {quoteLoading && !quotePreview && (
              <p className="quote-placeholder">
                Resolving the customer and item against Business Central…
              </p>
            )}

            {quoteError && (
              <p className="error-message" role="alert">
                {quoteError}
              </p>
            )}
          </section>
        )}

        <section
          className="history-panel"
          aria-labelledby="history-title"
        >
          <div className="history-heading">
            <div>
              <p className="section-kicker">Session trace</p>
              <h2 id="history-title">Conversation history</h2>
              <p>
                Voice, tool and verification events from this browser
                session. Nothing here is stored on our server.
              </p>
            </div>

            <div className="history-actions">
              <span aria-live="polite">{copyStatus}</span>
              <button
                type="button"
                onClick={() => void copySession()}
                disabled={!history.length}
              >
                Copy session
              </button>
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  setCopyStatus("");
                }}
                disabled={!history.length}
              >
                Clear
              </button>
            </div>
          </div>

          {history.length ? (
            <ol className="history-list">
              {history.map((entry) => (
                <li key={entry.id} className={"history-" + entry.kind}>
                  <time>{entry.at}</time>
                  <div>
                    <span>{entry.label}</span>
                    <p>{entry.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(entry.text, "Entry copied")
                    }
                    aria-label={"Copy " + entry.label + " entry"}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="history-empty">
              Start a voice session or verify a customer. The trace will
              appear here in chronological order.
            </p>
          )}
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
  lines,
}: {
  label: string;
  order: OrderSummary | null;
  currency: string;
  lines?: LargestOrder["lines"];
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
            <span>
              {order.fully_shipped
                ? "Fully shipped"
                : "Not fully shipped"}
            </span>
          </div>

          {lines?.length ? (
            <ul className="order-lines">
              {lines.slice(0, 3).map((line) => (
                <li key={line.item_number + line.description}>
                  <span>
                    <strong className="mono">
                      {line.item_number}
                    </strong>
                    <small>{line.description}</small>
                  </span>
                  <span className="mono">
                    {line.quantity} × {money(line.unit_price, currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
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
