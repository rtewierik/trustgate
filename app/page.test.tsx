import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ── Mock scrollIntoView (not implemented in jsdom) ─────────────────────────
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

jest.mock("next/link", () => {
  const MockLink = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a href={href} {...rest}>{children}</a>;
  MockLink.displayName = "MockLink";
  return MockLink;
});

import LandingPage from "./page";

// ── helpers ────────────────────────────────────────────────────────────────
async function clickHowItWorks() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: /how it works/i }));
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("LandingPage", () => {

  // ── 1. Header ──────────────────────────────────────────────────────────
  describe("Header", () => {
    it("renders the TrustGate logo text", () => {
      render(<LandingPage />);
      expect(screen.getByText("TrustGate")).toBeInTheDocument();
    });

    it("renders a History nav link to /history/", () => {
      render(<LandingPage />);
      expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute("href", "/history/");
    });
  });

  // ── 2. Hero section ────────────────────────────────────────────────────
  describe("Hero section", () => {
    it("renders the h1 heading", () => {
      render(<LandingPage />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });

    it("h1 contains 'Ask the network'", () => {
      render(<LandingPage />);
      expect(screen.getByText(/ask the network/i)).toBeInTheDocument();
    });

    it("renders the subtitle mentioning '10 seconds'", () => {
      render(<LandingPage />);
      expect(screen.getByText(/10 seconds/i)).toBeInTheDocument();
    });

    it("renders the 'Try demo' CTA linking to /demo/", () => {
      render(<LandingPage />);
      expect(screen.getByRole("link", { name: /try demo/i })).toHaveAttribute("href", "/demo/");
    });

    it("renders the 'How it works ↓' scroll hint", () => {
      render(<LandingPage />);
      expect(screen.getByRole("link", { name: /how it works/i })).toBeInTheDocument();
    });

    it("'How it works' link points to #how", () => {
      render(<LandingPage />);
      expect(screen.getByRole("link", { name: /how it works/i })).toHaveAttribute("href", "#how");
    });
  });

  // ── 3. How it works — collapsed by default ─────────────────────────────
  describe("How it works — collapsed by default", () => {
    it("does not show 'How it works' heading before clicking", () => {
      render(<LandingPage />);
      expect(screen.queryByRole("heading", { name: /how it works/i })).not.toBeInTheDocument();
    });

    it("does not show step cards before clicking", () => {
      render(<LandingPage />);
      expect(screen.queryByText(/number \+ details/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/three checks/i)).not.toBeInTheDocument();
    });
  });

  // ── 4. How it works — expanded after click ─────────────────────────────
  describe("How it works — expanded after click", () => {
    it("shows the 'How it works' h2 after clicking the scroll hint", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument()
      );
    });

    it("shows step 1 — Number + details", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByText(/number \+ details/i)).toBeInTheDocument()
      );
    });

    it("shows step 2 — Three checks", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByText(/three checks/i)).toBeInTheDocument()
      );
    });

    it("shows step 3 — Trust Score", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByText(/trust score/i)).toBeInTheDocument()
      );
    });

    it("shows step numbers 1, 2, 3", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() => screen.getByText(/three checks/i));
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("mentions CAMARA in step 2 description", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByText(/CAMARA/)).toBeInTheDocument()
      );
    });

    it("mentions Allow/Deny in step 3 description", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() =>
        expect(screen.getByText(/allow\/deny/i)).toBeInTheDocument()
      );
    });

    it("calls scrollIntoView after expanding", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() => screen.getByRole("heading", { name: /how it works/i }));
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("section becomes visible (not display:none) after click", async () => {
      render(<LandingPage />);
      await clickHowItWorks();
      await waitFor(() => screen.getByRole("heading", { name: /how it works/i }));
      const section = document.getElementById("how");
      expect(section).not.toHaveStyle("display: none");
    });
  });

  // ── 5. Hash #how on mount ──────────────────────────────────────────────
  describe("Auto-expand when URL hash is #how", () => {
    beforeEach(() => {
      // jsdom allows setting location.hash directly
      window.location.hash = "#how";
    });

    afterEach(() => {
      window.location.hash = "";
    });

    it("auto-expands the how section when hash is #how", async () => {
      render(<LandingPage />);
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument()
      );
    });
  });

  // ── 6. Footer ──────────────────────────────────────────────────────────
  describe("Footer", () => {
    it("renders a footer element", () => {
      render(<LandingPage />);
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    it("footer mentions Hackathon 2026", () => {
      render(<LandingPage />);
      expect(screen.getByText(/hackathon 2026/i)).toBeInTheDocument();
    });

    it("footer mentions Team12", () => {
      render(<LandingPage />);
      expect(screen.getByText(/team12/i)).toBeInTheDocument();
    });
  });

  // ── 7. Accessibility ───────────────────────────────────────────────────
  describe("Accessibility", () => {
    it("hero background decoration has aria-hidden", () => {
      render(<LandingPage />);
      expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    });

    it("'Try demo' CTA is an anchor tag", () => {
      render(<LandingPage />);
      expect(screen.getByRole("link", { name: /try demo/i }).tagName).toBe("A");
    });
  });
});