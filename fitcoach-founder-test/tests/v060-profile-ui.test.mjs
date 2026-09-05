import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../v040/core/store.mjs";
import { renderProfileScreen } from "../v040/ui/profile-screen.mjs";

const state = () => createInitialState("mo", new Date("2026-09-04T12:00:00Z"));

test("Profile defaults to compact honest service summaries with policy links outside disclosures", () => {
  const html = renderProfileScreen({ state: state(), ui: {} });
  assert.match(html, /<h1>Your space\.<\/h1>/u);
  assert.match(html, /data-disclosure="profile-account" >/u);
  assert.match(html, /data-disclosure="profile-membership" >/u);
  assert.match(html, /Local only · account setup unavailable/u);
  assert.match(html, /Purchases unavailable here/u);
  assert.doesNotMatch(html, /STORE-VERIFIED|Premium active/u);
  assert.match(html, /<\/details><footer class="privacy-links">/u);
  for (const page of ["privacy", "terms", "delete-account", "support"]) {
    assert.match(html, new RegExp(`href="\\./legal/${page}\\.html"`, "u"));
  }
});

test("account disclosure keeps code entry, errors, destructive confirmation, and sync conflicts visible", () => {
  const cases = [
    { account: { codeSent: true } },
    { account: { error: "Connection interrupted" } },
    { account: { confirmDelete: true } },
    { cloudStatus: "conflict" },
  ];
  for (const item of cases) {
    const current = state();
    if (item.cloudStatus) current.integrations.cloudSync.status = item.cloudStatus;
    const html = renderProfileScreen({ state: current, ui: { account: { config: { authAvailable: true }, ...item.account } } });
    assert.match(html, /data-disclosure="profile-account" open>/u);
  }
});

test("available native offers retain their real purchase action and supplied price inside membership details", () => {
  const html = renderProfileScreen({ state: state(), ui: {
    disclosures: { "profile-membership": true },
    account: {
      config: { authAvailable: true, capabilities: { subscriptions: true, entitlements: true } },
      session: { user: { email: "tester@example.com" } },
      entitlement: { premium: false },
    },
    native: { billingAvailable: true, offerings: [{ logicalId: "premium_monthly", displayName: "Monthly", periodLabel: "Every month", localizedPrice: "$9.99" }] },
  } });
  assert.match(html, /data-disclosure="profile-membership" open>/u);
  assert.match(html, /View plans from your app store/u);
  assert.match(html, /data-action="subscription-purchase" data-value="premium_monthly"/u);
  assert.match(html, /<strong>\$9\.99<\/strong>/u);
  assert.match(html, /data-action="subscription-restore"/u);
  assert.doesNotMatch(html, /Premium is active/u);
});

test("training edit opens beside its row and retains all seven accessible preference groups", () => {
  const html = renderProfileScreen({ state: state(), ui: { profileEditing: "training" } });
  assert.match(html, /data-value="training" aria-expanded="true"/u);
  assert.equal((html.match(/class="profile-plan-options" role="radiogroup"/gu) || []).length, 7);
  assert.ok(html.indexOf('id="profile-training-editor"') < html.indexOf('data-disclosure="profile-account"'));
});
