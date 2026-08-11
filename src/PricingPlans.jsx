import { useState } from "react";
import { supabase } from "./supabase.js";

const M = "'Geist Mono','JetBrains Mono', monospace";

const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Everything you need to stay prepared on a single device.",
    features: [
      "Full inventory tracking (22 categories)",
      "Crisis simulation (13 scenarios)",
      "Comms center & frequency scanner",
      "Property intelligence & mapping",
      "Farming tracker & planting guide",
      "Local encryption (AES-256-GCM)",
      "Single device storage",
    ],
    cta: "Current Plan",
    highlight: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$9",
    period: "/month",
    desc: "Sync across devices, coordinate your team, and stay ready together.",
    features: [
      "Everything in Free",
      "Cloud sync across all devices",
      "Team coordination & member tracking",
      "AES-256 encrypted team chat",
      "Live satellite member overlays",
      "Trade offers & resource sharing",
      "Team rally points & comms plan",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
};

export default function PricingPlans({ userPlan, onUpgrade, onClose }) {
  const [selectedBilling, setSelectedBilling] = useState("monthly");
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const monthlyPrice = 9;
  const annualPrice = Math.round(monthlyPrice * 10); // $90/yr = ~$7.50/mo

  const handleStartCheckout = () => {
    setShowCheckout(true);
  };

  const handleCardSubmit = async (e) => {
    e.preventDefault();
    setUpgradeLoading(true);
    setUpgradeError("");

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          billing: selectedBilling,
          returnUrl: window.location.origin,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      setUpgradeError(err.message || "Checkout failed. Please try again.");
      setUpgradeLoading(false);
    }
  };

  if (showCheckout) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1150, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div style={{ background: "#13151a", borderRadius: 14, width: "92%", maxWidth: 440, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, fontFamily: M, marginBottom: 10, boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>P</div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Upgrade to Pro</h3>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Secure checkout powered by Stripe</p>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setSelectedBilling("monthly")}
                style={{
                  flex: 1, padding: "12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  background: selectedBilling === "monthly" ? "rgba(200,85,58,0.1)" : "rgba(255,255,255,0.02)",
                  border: selectedBilling === "monthly" ? "1px solid rgba(200,85,58,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: selectedBilling === "monthly" ? "#fff" : "rgba(255,255,255,0.5)",
                }}
              >
                <div>Monthly</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: M, marginTop: 2 }}>${monthlyPrice}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)" }}>/mo</span></div>
              </button>
              <button
                onClick={() => setSelectedBilling("annual")}
                style={{
                  flex: 1, padding: "12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  background: selectedBilling === "annual" ? "rgba(200,85,58,0.1)" : "rgba(255,255,255,0.02)",
                  border: selectedBilling === "annual" ? "1px solid rgba(200,85,58,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: selectedBilling === "annual" ? "#fff" : "rgba(255,255,255,0.5)",
                }}
              >
                <div>Annual <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 700 }}>Save 17%</span></div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: M, marginTop: 2 }}>${Math.round(annualPrice / 12)}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.35)" }}>/mo</span></div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>${annualPrice} billed yearly</div>
              </button>
            </div>

            {upgradeError && (
              <div style={{ padding: "8px 12px", marginBottom: 14, borderRadius: 6, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 10, color: "#ef4444" }}>{upgradeError}</div>
            )}

            <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Order Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>PrepVault Pro ({selectedBilling})</span>
                <span style={{ color: "#fff", fontWeight: 700, fontFamily: M }}>
                  ${selectedBilling === "annual" ? annualPrice : monthlyPrice}
                </span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: "#fff" }}>Total today</span>
                <span style={{ color: "#c8553a", fontFamily: M }}>
                  ${selectedBilling === "annual" ? annualPrice : monthlyPrice}
                </span>
              </div>
            </div>

            <form onSubmit={handleCardSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Card Number</label>
                <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: M }}>Stripe-hosted checkout</div>
              </div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "0 0 16px", lineHeight: 1.5 }}>
                You'll be redirected to Stripe's secure checkout page to complete payment. Cancel anytime — your data stays yours.
              </p>
              <button
                type="submit"
                disabled={upgradeLoading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 10,
                  background: upgradeLoading ? "rgba(200,85,58,0.3)" : "linear-gradient(135deg,#c8553a,#a3412d)",
                  color: "#fff", border: "none", cursor: upgradeLoading ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                }}
              >
                {upgradeLoading ? "Redirecting to Stripe..." : "Proceed to Checkout"}
              </button>
            </form>
          </div>

          <div style={{ padding: "12px 24px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#13151a", borderRadius: 14, width: "92%", maxWidth: 800, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#c8553a,#8b2e1a)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, fontFamily: M, marginBottom: 10, boxShadow: "0 4px 20px rgba(200,85,58,0.3)" }}>P</div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Choose Your Plan</h3>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Start free. Upgrade when you're ready to sync and coordinate with your team.</p>
        </div>

        <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {Object.values(PLANS).map((plan) => {
            const isCurrent = userPlan === plan.id;
            return (
              <div
                key={plan.id}
                style={{
                  padding: "24px 20px",
                  borderRadius: 14,
                  background: plan.highlight ? "rgba(200,85,58,0.04)" : "rgba(255,255,255,0.015)",
                  border: plan.highlight ? "1px solid rgba(200,85,58,0.25)" : "1px solid rgba(255,255,255,0.06)",
                  display: "flex", flexDirection: "column",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, fontFamily: M, color: plan.highlight ? "#c8553a" : "#fff" }}>{plan.price}</span>
                  {plan.period !== "forever" && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{plan.period}</span>}
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "0 0 16px" }}>{plan.desc}</p>

                <div style={{ flex: 1, marginBottom: 20 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                      <span style={{ color: "#22c55e", fontSize: 12, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (isCurrent) {
                      onClose();
                    } else {
                      handleStartCheckout();
                    }
                  }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 8, cursor: isCurrent ? "default" : "pointer",
                    background: isCurrent ? "rgba(255,255,255,0.04)" : plan.highlight ? "linear-gradient(135deg,#c8553a,#a3412d)" : "rgba(255,255,255,0.04)",
                    color: isCurrent ? "rgba(255,255,255,0.3)" : "#fff", border: isCurrent ? "1px solid rgba(255,255,255,0.06)" : "none",
                    fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: isCurrent ? 0.6 : 1,
                  }}
                  disabled={isCurrent}
                >
                  {isCurrent ? "Current Plan" : plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 24px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}
