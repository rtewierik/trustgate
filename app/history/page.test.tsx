import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Mock child components with minimal but testable output
jest.mock("@/components/AppHeader", () => ({
  AppHeader: () => (
    <header>
      <a href="/">TrustGate</a>
      <nav><a href="/history/">History</a></nav>
    </header>
  ),
}));

jest.mock("@/components/VerificationResultCard", () => ({
  VerificationResultCard: ({ verification }: { verification: { verification_id: string; decision: string; trust_score: number; status: string; subject?: { phone_number: string; country: string }; created_at?: string } }) => (
    <div data-testid="result-card">
      <p data-testid="card-decision">{verification.decision}</p>
      <p data-testid="card-trust-score">{verification.trust_score}</p>
      <p data-testid="card-status">{verification.status}</p>
      <p data-testid="card-id">{verification.verification_id}</p>
      {verification.subject && (
        <p data-testid="card-subject">{verification.subject.phone_number} · {verification.subject.country}</p>
      )}
      {verification.created_at && (
        <p data-testid="card-created">{verification.created_at}</p>
      )}
    </div>
  ),
}));

jest.mock("@/components/VerificationFeedbackSection", () => ({
  VerificationFeedbackSection: ({ verification }: { verification: { verification_id: string; decision: string } }) => (
    <div data-testid="feedback-section">
      <p data-testid="feedback-id">{verification.verification_id}</p>
      <p data-testid="feedback-decision">{verification.decision}</p>
    </div>
  ),
}));

jest.mock("@/lib/api", () => ({ API_BASE: "" }));
jest.mock("@/lib/layoutStyles", () => ({
  pageLayoutStyles: {
    main: {}, content: {}, h1: {}, subtitle: {}, form: {},
    row: {}, label: {}, input: {}, button: {}, error: {},
  },
}));

import HistoryPage from "./page";

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_VERIFICATION_ALLOW = {
  verification_id: "550e8400-e29b-41d4-a716-446655440000",
  status: "completed",
  trust_score: 88,
  decision: "allow" as const,
  checks: [{ name: "number_verification", status: "pass" }],
  subject: { phone_number: "+34600000001", country: "ES" },
  created_at: "2024-06-01T10:00:00Z",
  expires_at: null,
};

const MOCK_VERIFICATION_DENY = {
  verification_id: "deny-id-001",
  status: "completed",
  trust_score: 20,
  decision: "deny" as const,
  checks: [{ name: "sim_swap", status: "fail" }],
  subject: { phone_number: "+1202555000", country: "US" },
  created_at: "2024-06-02T12:00:00Z",
  expires_at: null,
};

// ── Fetch helpers ──────────────────────────────────────────────────────────

function mockFetchSuccess(data: typeof MOCK_VERIFICATION_ALLOW | typeof MOCK_VERIFICATION_DENY = MOCK_VERIFICATION_ALLOW) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  } as Response);
}

function mockFetchError(message = "Not found") {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: message }),
  } as Response);
}

function mockFetchNetworkFailure() {
  global.fetch = jest.fn().mockRejectedValueOnce(new Error("Network error"));
}

// ── Helper: type an ID and submit ─────────────────────────────────────────

async function typeIdAndSubmit(id: string) {
  const user = userEvent.setup();
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, id);
  await user.click(screen.getByRole("button", { name: /search/i }));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("HistoryPage (consult verification)", () => {
  afterEach(() => jest.resetAllMocks());

  // ── 1. Initial render ──────────────────────────────────────────────────
  describe("Initial render", () => {
    it("renders the AppHeader", () => {
      render(<HistoryPage />);
      expect(screen.getByRole("link", { name: "TrustGate" })).toBeInTheDocument();
    });

    it("renders the page h1 heading", () => {
      render(<HistoryPage />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });

    it("renders a subtitle mentioning verification_id", () => {
      render(<HistoryPage />);
      expect(screen.getByText(/verification_id/i)).toBeInTheDocument();
    });

    it("renders the Verification ID text input", () => {
      render(<HistoryPage />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders the Search button enabled", () => {
      render(<HistoryPage />);
      expect(screen.getByRole("button", { name: /search/i })).not.toBeDisabled();
    });

    it("does not show result card on initial render", () => {
      render(<HistoryPage />);
      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });

    it("does not show feedback section on initial render", () => {
      render(<HistoryPage />);
      expect(screen.queryByTestId("feedback-section")).not.toBeInTheDocument();
    });

    it("does not show an error on initial render", () => {
      render(<HistoryPage />);
      expect(screen.queryByText(/not found|error/i)).not.toBeInTheDocument();
    });
  });

  // ── 2. Form interaction ────────────────────────────────────────────────
  describe("Form interaction", () => {
    it("updates the input value when typing", async () => {
      render(<HistoryPage />);
      const user = userEvent.setup();
      const input = screen.getByRole("textbox");
      await user.type(input, "abc-123");
      expect(input).toHaveValue("abc-123");
    });

    it("renders the input placeholder with a UUID example", () => {
      render(<HistoryPage />);
      expect(screen.getByPlaceholderText(/550e8400/i)).toBeInTheDocument();
    });

    it("does not call fetch when submitting with empty input", async () => {
      global.fetch = jest.fn();
      render(<HistoryPage />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /search/i }));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not call fetch when input is only whitespace", async () => {
      global.fetch = jest.fn();
      render(<HistoryPage />);
      const user = userEvent.setup();
      await user.type(screen.getByRole("textbox"), "   ");
      await user.click(screen.getByRole("button", { name: /search/i }));
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── 3. Loading state ───────────────────────────────────────────────────
  describe("Loading state", () => {
    it("disables the button while loading", async () => {
      global.fetch = jest.fn().mockReturnValueOnce(new Promise(() => {}));
      render(<HistoryPage />);
      const user = userEvent.setup();
      await user.type(screen.getByRole("textbox"), "some-id");
      await user.click(screen.getByRole("button", { name: /search/i }));
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("shows 'Searching…' while loading", async () => {
      global.fetch = jest.fn().mockReturnValueOnce(new Promise(() => {}));
      render(<HistoryPage />);
      const user = userEvent.setup();
      await user.type(screen.getByRole("textbox"), "some-id");
      await user.click(screen.getByRole("button"));
      expect(screen.getByRole("button")).toHaveTextContent(/searching/i);
    });
  });

  // ── 4. API call ────────────────────────────────────────────────────────
  describe("API call", () => {
    it("calls the correct endpoint with the verification ID", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/completed-verifications/550e8400-e29b-41d4-a716-446655440000")
      );
    });

    it("URL-encodes special characters in the ID", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("id with spaces");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("id%20with%20spaces")
      );
    });

    it("trims whitespace from the ID before calling the API", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("  my-id  ");
      await waitFor(() => screen.getByTestId("result-card"));
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain(" ");
    });
  });

  // ── 5. Successful result ───────────────────────────────────────────────
  describe("Successful result — allow", () => {
    it("renders the VerificationResultCard after success", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() =>
        expect(screen.getByTestId("result-card")).toBeInTheDocument()
      );
    });

    it("passes the correct decision to the result card", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-decision")).toHaveTextContent("allow");
    });

    it("passes the trust score to the result card", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-trust-score")).toHaveTextContent("88");
    });

    it("passes the verification ID to the result card", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-id")).toHaveTextContent("550e8400-e29b-41d4-a716-446655440000");
    });

    it("renders the feedback section after success", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() =>
        expect(screen.getByTestId("feedback-section")).toBeInTheDocument()
      );
    });

    it("passes correct verification_id to the feedback section", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("feedback-section"));
      expect(screen.getByTestId("feedback-id")).toHaveTextContent("550e8400-e29b-41d4-a716-446655440000");
    });

    it("passes correct decision to the feedback section", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("feedback-section"));
      expect(screen.getByTestId("feedback-decision")).toHaveTextContent("allow");
    });

    it("does not show an error panel on success", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.queryByText("Not found")).not.toBeInTheDocument();
    });

    it("re-enables the Search button after success", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /search/i })).not.toBeDisabled()
      );
    });
  });

  describe("Successful result — deny", () => {
    it("passes deny decision to the result card", async () => {
      mockFetchSuccess(MOCK_VERIFICATION_DENY);
      render(<HistoryPage />);
      await typeIdAndSubmit("deny-id-001");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-decision")).toHaveTextContent("deny");
    });

    it("passes the low trust score to the result card", async () => {
      mockFetchSuccess(MOCK_VERIFICATION_DENY);
      render(<HistoryPage />);
      await typeIdAndSubmit("deny-id-001");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-trust-score")).toHaveTextContent("20");
    });
  });

  // ── 6. Error states ────────────────────────────────────────────────────
  describe("Error states", () => {
    it("shows the API error message", async () => {
      mockFetchError("Verification not found");
      render(<HistoryPage />);
      await typeIdAndSubmit("bad-id");
      await waitFor(() =>
        expect(screen.getByText("Verification not found")).toBeInTheDocument()
      );
    });

    it("shows a network error message", async () => {
      mockFetchNetworkFailure();
      render(<HistoryPage />);
      await typeIdAndSubmit("any-id");
      await waitFor(() =>
        expect(screen.getByText("Network error")).toBeInTheDocument()
      );
    });

    it("does not render the result card on error", async () => {
      mockFetchError();
      render(<HistoryPage />);
      await typeIdAndSubmit("bad-id");
      await waitFor(() => screen.getByText("Not found"));
      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });

    it("does not render the feedback section on error", async () => {
      mockFetchError();
      render(<HistoryPage />);
      await typeIdAndSubmit("bad-id");
      await waitFor(() => screen.getByText("Not found"));
      expect(screen.queryByTestId("feedback-section")).not.toBeInTheDocument();
    });

    it("re-enables the button after error", async () => {
      mockFetchError();
      render(<HistoryPage />);
      await typeIdAndSubmit("bad-id");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /search/i })).not.toBeDisabled()
      );
    });
  });

  // ── 7. Re-submission / state clearing ─────────────────────────────────
  describe("Re-submission", () => {
    it("clears a previous error when submitting again", async () => {
      mockFetchError("First error");
      render(<HistoryPage />);
      await typeIdAndSubmit("bad-id");
      await waitFor(() => screen.getByText("First error"));

      mockFetchSuccess();
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });

    it("clears a previous result when a new search returns an error", async () => {
      mockFetchSuccess();
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("result-card"));

      mockFetchError("Not found");
      await typeIdAndSubmit("nonexistent");
      await waitFor(() => screen.getByText("Not found"));
      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });

    it("replaces a previous result with the new one", async () => {
      mockFetchSuccess(MOCK_VERIFICATION_ALLOW);
      render(<HistoryPage />);
      await typeIdAndSubmit("550e8400-e29b-41d4-a716-446655440000");
      await waitFor(() => screen.getByTestId("card-id"));
      expect(screen.getByTestId("card-id")).toHaveTextContent("550e8400-e29b-41d4-a716-446655440000");

      mockFetchSuccess(MOCK_VERIFICATION_DENY);
      await typeIdAndSubmit("deny-id-001");
      await waitFor(() =>
        expect(screen.getByTestId("card-id")).toHaveTextContent("deny-id-001")
      );
    });
  });
});