import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ── Browser API mocks ──────────────────────────────────────────────────────
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

// ── Next.js mocks ──────────────────────────────────────────────────────────
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

// ── Component mocks ────────────────────────────────────────────────────────
jest.mock("@/components/AppHeader", () => ({
  AppHeader: () => (
    <header>
      <a href="/">TrustGate</a>
      <nav><a href="/history/">History</a></nav>
    </header>
  ),
}));

jest.mock("@/components/VerificationResultCard", () => ({
  VerificationResultCard: ({ verification }: { verification: Record<string, unknown> }) => (
    <div data-testid="result-card">
      <p data-testid="card-decision">{String(verification.decision)}</p>
      <p data-testid="card-id">{String(verification.verification_id)}</p>
      <p data-testid="card-trust-score">{String(verification.trust_score)}</p>
    </div>
  ),
}));

jest.mock("@/components/VerificationFeedbackSection", () => ({
  VerificationFeedbackSection: ({ verification }: { verification: Record<string, unknown> }) => (
    <div data-testid="feedback-section">
      <p data-testid="feedback-id">{String(verification.verification_id)}</p>
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

import DemoPage from "./page";

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_INITIATE = {
  authorization_url: "https://operator.example.com/auth?code=abc",
  verification_id: "init-ver-001",
  message: "Verification initiated",
};

const MOCK_RESULT_ALLOW = {
  verification_id: "ver-001",
  status: "completed",
  trust_score: 90,
  decision: "allow",
  checks: [{ name: "number_verification", status: "pass" }],
};

const MOCK_RESULT_DENY = {
  verification_id: "ver-002",
  status: "completed",
  trust_score: 15,
  decision: "deny",
  checks: [{ name: "sim_swap", status: "fail" }],
};

// ── Fetch helpers ──────────────────────────────────────────────────────────
function mockFetchInitiateSuccess(data = MOCK_INITIATE) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  } as Response);
}

function mockFetchInitiateError(message = "Failed to start verification") {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: message }),
  } as Response);
}

function mockFetchInitiateThenResult(result = MOCK_RESULT_ALLOW) {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => result } as Response);
}

function mockFetchNetworkFailure() {
  global.fetch = jest.fn().mockRejectedValueOnce(new Error("Network error"));
}

// ── Form helper ───────────────────────────────────────────────────────────
async function fillAndSubmit({
  phone = "+34600000001",
  country = "ES",
} = {}) {
  const user = userEvent.setup();
  const phoneInput = document.querySelector('input[type="tel"]')!;
  await user.clear(phoneInput as HTMLElement);
  await user.type(phoneInput as HTMLElement, phone);
  if (country !== "ES") {
    await user.selectOptions(screen.getByRole("combobox"), country);
  }
  await user.click(screen.getByRole("button", { name: /start verification/i }));
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DemoPage", () => {
  afterEach(() => {
    jest.resetAllMocks();
    mockSearchParams.delete("state");
  });

  // ── 1. Initial render ──────────────────────────────────────────────────
  describe("Initial render", () => {
    it("renders the AppHeader", () => {
      render(<DemoPage />);
      expect(screen.getByRole("link", { name: "TrustGate" })).toBeInTheDocument();
    });

    it("renders the h1 heading", () => {
      render(<DemoPage />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });

    it("renders the subtitle", () => {
      render(<DemoPage />);
      expect(screen.getByText(/phone number/i)).toBeInTheDocument();
    });

    it("renders 'Start verification' button enabled", () => {
      render(<DemoPage />);
      expect(screen.getByRole("button", { name: /start verification/i })).not.toBeDisabled();
    });

    it("does not show result card on initial render", () => {
      render(<DemoPage />);
      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });

    it("does not show initiate panel on initial render", () => {
      render(<DemoPage />);
      expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
    });

    it("does not show an error on initial render", () => {
      render(<DemoPage />);
      expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });
  });

  // ── 2. Form fields ─────────────────────────────────────────────────────
  describe("Form fields", () => {
    it("renders a phone/tel input with placeholder", () => {
      render(<DemoPage />);
      expect(document.querySelector('input[type="tel"]')).toBeInTheDocument();
    });

    it("renders the country selector defaulting to ES", () => {
      render(<DemoPage />);
      expect(screen.getByRole("combobox")).toHaveValue("ES");
    });

    it("renders country options ES, DE, FR, GB", () => {
      render(<DemoPage />);
      const values = screen.getAllByRole("option").map(o => o.getAttribute("value"));
      expect(values).toEqual(expect.arrayContaining(["ES", "DE", "FR", "GB"]));
    });

    it("renders first name, last name and date inputs", () => {
      render(<DemoPage />);
      expect(screen.getByPlaceholderText("Ada")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Lovelace")).toBeInTheDocument();
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
    });

    it("updates phone field on type", async () => {
      render(<DemoPage />);
      const user = userEvent.setup();
      const input = document.querySelector('input[type="tel"]')!;
      await user.type(input as HTMLElement, "+34600000001");
      expect(input).toHaveValue("+34600000001");
    });

    it("updates country on change", async () => {
      render(<DemoPage />);
      const user = userEvent.setup();
      await user.selectOptions(screen.getByRole("combobox"), "DE");
      expect(screen.getByRole("combobox")).toHaveValue("DE");
    });
  });

  // ── 3. Loading state ───────────────────────────────────────────────────
  describe("Loading state", () => {
    it("disables button and shows 'Starting…' while loading", async () => {
      global.fetch = jest.fn().mockReturnValueOnce(new Promise(() => {}));
      render(<DemoPage />);
      const user = userEvent.setup();
      await user.type(document.querySelector('input[type="tel"]') as HTMLElement, "+34600000001");
      await user.click(screen.getByRole("button", { name: /start verification/i }));
      expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled();
    });
  });

  // ── 4. Successful initiate ─────────────────────────────────────────────
  describe("Successful initiate", () => {
    it("calls POST /api/v1/verifications/initiate", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/verifications/initiate"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("sends phone and country in the POST body", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit({ phone: "+34600000001", country: "ES" });
      await waitFor(() => screen.getByText(/next step/i));
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.subject.phone_number).toBe("+34600000001");
      expect(body.subject.country).toBe("ES");
    });

    it("sends the three required checks", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.checks).toEqual(["number_verification", "sim_swap", "kyc_match"]);
    });

    it("shows 'Next step' panel after initiate", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByText(/next step/i)).toBeInTheDocument()
      );
    });

    it("shows the popup button after initiate", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /open verification/i })).toBeInTheDocument()
      );
    });

    it("shows the verification ID in the initiate panel", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByText(/init-ver-001/)).toBeInTheDocument()
      );
    });

    it("calls scrollIntoView after initiate result appears", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  // ── 5. Popup flow ──────────────────────────────────────────────────────
  describe("Popup window flow", () => {
    it("calls window.open when the popup button is clicked", async () => {
      const mockPopup = { closed: false, postMessage: jest.fn() };
      window.open = jest.fn().mockReturnValue(mockPopup);
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByRole("button", { name: /open verification/i }));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open verification/i }));
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("/demo/verification-popup"),
        "TrustGateNumberVerification",
        expect.any(String)
      );
    });

    it("fetches completed verification after NUMBER_VERIFICATION_DONE message", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "some-state" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() =>
        expect(screen.getByTestId("result-card")).toBeInTheDocument()
      );
    });

    it("ignores messages from different origins", async () => {
      mockFetchInitiateSuccess();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "evil-state" },
          origin: "https://evil.example.com",
        }));
      });

      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });
  });

  // ── 6. Result display ─────────────────────────────────────────────────
  describe("Result display", () => {
    it("shows VerificationResultCard after receiving result", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "s1" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() => expect(screen.getByTestId("result-card")).toBeInTheDocument());
      expect(screen.getByTestId("card-decision")).toHaveTextContent("allow");
      expect(screen.getByTestId("card-id")).toHaveTextContent("ver-001");
    });

    it("shows VerificationFeedbackSection after receiving result", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "s2" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() => expect(screen.getByTestId("feedback-section")).toBeInTheDocument());
    });

    it("hides the form when a result is shown", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "s3" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.queryByRole("button", { name: /start verification/i })).not.toBeInTheDocument();
    });

    it("shows 'New verification' button after result", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "s4" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /new verification/i })).toBeInTheDocument()
      );
    });

    it("clicking 'New verification' resets to the form", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_INITIATE } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT_ALLOW } as Response);

      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));

      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "NUMBER_VERIFICATION_DONE", state: "s5" },
          origin: window.location.origin,
        }));
      });

      await waitFor(() => screen.getByRole("button", { name: /new verification/i }));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /new verification/i }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /start verification/i })).toBeInTheDocument()
      );
      expect(screen.queryByTestId("result-card")).not.toBeInTheDocument();
    });
  });

  // ── 7. state param in URL ──────────────────────────────────────────────
  describe("?state param in URL", () => {
    it("fetches completed verification when state param is present", async () => {
      mockSearchParams.set("state", "url-state-001");
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESULT_DENY,
      } as Response);

      render(<DemoPage />);

      await waitFor(() =>
        expect(screen.getByTestId("result-card")).toBeInTheDocument()
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("state=url-state-001")
      );
    });

    it("shows deny result from URL state param", async () => {
      mockSearchParams.set("state", "url-state-002");
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESULT_DENY,
      } as Response);

      render(<DemoPage />);
      await waitFor(() => screen.getByTestId("result-card"));
      expect(screen.getByTestId("card-decision")).toHaveTextContent("deny");
    });
  });

  // ── 8. Error states ────────────────────────────────────────────────────
  describe("Error states", () => {
    it("shows API error message on initiate failure", async () => {
      mockFetchInitiateError("Unauthorized");
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByText("Unauthorized")).toBeInTheDocument()
      );
    });

    it("shows network error message when fetch throws", async () => {
      mockFetchNetworkFailure();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByText("Network error")).toBeInTheDocument()
      );
    });

    it("does not show initiate panel on error", async () => {
      mockFetchInitiateError();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText("Failed to start verification"));
      expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
    });

    it("re-enables the button after error", async () => {
      mockFetchInitiateError();
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /start verification/i })).not.toBeDisabled()
      );
    });

    it("clears previous error on new submit", async () => {
      mockFetchInitiateError("First error");
      render(<DemoPage />);
      await fillAndSubmit();
      await waitFor(() => screen.getByText("First error"));

      mockFetchInitiateSuccess();
      await fillAndSubmit();
      await waitFor(() => screen.getByText(/next step/i));
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });
  });
});