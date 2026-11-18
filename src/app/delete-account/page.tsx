"use client";

import { LegalShell } from "@/features/legal/components/legal-shell";
import { Trash2 } from "lucide-react";

const TOC = [
  { id: "deletion-overview", label: "Deletion Overview" },
  { id: "interactive-form", label: "Deletion Request Options" },
  { id: "what-is-deleted", label: "What Deletion Removes and Retains" },
  { id: "what-is-retained", label: "Clinical and Appointment Records" },
  { id: "in-app-steps", label: "How to Delete In-App" },
  { id: "deletion-timeline", label: "What to Expect" },
  { id: "contact-privacy", label: "Privacy Desk Contact" },
];

export default function DeleteAccountPage() {
  return (
    <LegalShell
      title="Account & Data Deletion Portal"
      badge="Account privacy"
      subtitle="Find the available ways to request deletion of your Dr. Hair account and personal data."
      lastUpdated="October 31, 2026"
      effectiveDate="October 31, 2026"
      tableOfContents={TOC}
    >
      <div className="space-y-8">
        {/* Compliance Notice */}
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <Trash2 size={20} className="shrink-0 text-amber-700 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Deletion request:</strong> This page does not currently submit or log deletion requests. Use the authenticated deletion flow in the Dr. Hair app, or email our support team. Do not treat this page as confirmation that an account has been deleted.
          </div>
        </div>

        {/* Section 1: Overview */}
        <section id="deletion-overview">
          <h2>1. Overview &amp; Store Compliance</h2>
          <p>
            At <strong>Dr. Hair Clinic &amp; Cosmodent</strong>, you can request deletion of your account and personal data through the authenticated flow in the Dr. Hair app. If you cannot access the app, contact our support team by email; this website page does not itself create a deletion request.
          </p>
        </section>

        {/* Section 2: Interactive Web Request Form */}
        <section id="interactive-form">
          <h2>2. Request Account Deletion</h2>
          <p>
            The public website does not submit deletion requests. Use <strong>Profile → Account Settings → Delete Account &amp; Data</strong> in the app, where your account can be authenticated. If you cannot sign in, email <a className="font-semibold text-[#0D9488]" href="mailto:support@drhair.in?subject=Account%20Deletion%20Question">support@drhair.in</a> to ask about available options. This page does not log an external request, and sending an email does not itself delete your account.
          </p>

          <div className="my-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            <strong>Online submission unavailable:</strong> no information has been submitted or saved by this page. Use the in-app authenticated flow or contact support using the email above.
          </div>
        </section>

        {/* Section 3: What the authenticated deletion flow removes and retains */}
        <section id="what-is-deleted">
          <h2>3. What the In-App Deletion Flow Does</h2>
          <p>The authenticated in-app deletion operation removes the user account record, pending login OTPs, device notification tokens, patient activity, and progress check-ins.</p>
          <p>Clinical reports, treatment records, hair assessments, and appointments are retained by the clinic after account deletion. This website cannot confirm deletion of uploaded photos or other records. Contact support if you have questions about specific data.</p>
        </section>

        {/* Section 4: What is Retained */}
        <section id="what-is-retained">
          <h2>4. Clinical and Appointment Records</h2>
          <p>Clinic records such as clinical reports, treatment records, hair assessments, and appointments remain available to the clinic after the user account is deleted. Contact <a className="font-semibold text-[#0D9488]" href="mailto:support@drhair.in?subject=Account%20Deletion%20Question">support@drhair.in</a> with questions about how a specific record is handled.</p>
        </section>

        {/* Section 5: In-App Steps */}
        <section id="in-app-steps">
          <h2>5. How to Delete Your Account From Within the App</h2>
          <p>If you currently have the Dr. Hair application installed on your iPhone or Android device:</p>
          <ol>
            <li>Open the <strong>Dr. Hair App</strong> and sign in to your profile.</li>
            <li>Tap the <strong>Profile</strong> tab in the bottom navigation rail.</li>
            <li>Scroll down and tap <strong>Account Settings</strong> or <strong>Privacy &amp; Security</strong>.</li>
            <li>Select <strong>Delete Account &amp; Data</strong>.</li>
            <li>Review the in-app deletion information and follow the confirmation steps shown there. The authenticated deletion operation reports whether the account deletion succeeded.</li>
          </ol>
        </section>

        {/* Section 6: Processing Timeline */}
        <section id="deletion-timeline">
          <h2>6. What to Expect</h2>
          <ul>
            <li><strong>Website:</strong> This page does not submit, track, or issue a receipt for a deletion request.</li>
            <li><strong>In-app:</strong> The authenticated deletion operation reports success or failure in the app.</li>
            <li><strong>Questions:</strong> Email support for guidance. The website does not record the email or confirm that a request has been received.</li>
          </ul>
        </section>

        {/* Section 7: Contact */}
        <section id="contact-privacy">
          <h2>7. Privacy &amp; Data Deletion Desk</h2>
          <p>If you cannot use the authenticated in-app deletion flow, contact support with questions about available options:</p>
          <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] text-xs space-y-2">
            <p><strong>Email:</strong> <a href="mailto:support@drhair.in" className="text-[#0D9488] font-bold">support@drhair.in</a> (Subject: &quot;Account Deletion Request&quot;)</p>
            <p><strong>Phone:</strong> <a href="tel:+919119119965" className="text-[#0D9488] font-bold">+91 91191 19965</a></p>
            <p><strong>Clinic:</strong> Dr. Hair &amp; Cosmodent Clinic, Jaipur, Rajasthan, India</p>
          </div>
        </section>
      </div>
    </LegalShell>
  );
}

