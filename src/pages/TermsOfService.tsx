const TermsOfService = () => (
  <div className="min-h-screen bg-background p-6 md:p-12">
    <div className="max-w-3xl mx-auto prose prose-invert">
      <h1 className="font-display text-3xl text-foreground mb-6">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="space-y-4 text-foreground/90">
        <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">By using Normy Agent, you agree to these Terms of Service. If you do not agree, please do not use the service.</p>

        <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
        <p className="text-muted-foreground">Normy Agent is an AI-powered assistant that helps you manage your email inbox and calendar. It connects to your Google account to read emails, suggest replies, organize your calendar, and propose actions for your approval.</p>

        <h2 className="text-xl font-semibold text-foreground">3. User Responsibilities</h2>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>You are responsible for maintaining the security of your account credentials</li>
          <li>You must review and approve all actions before they are executed</li>
          <li>You must not use the service for any unlawful purpose</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">4. Google API Usage</h2>
        <p className="text-muted-foreground">Normy Agent's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

        <h2 className="text-xl font-semibold text-foreground">5. Approval-Based Actions</h2>
        <p className="text-muted-foreground">Normy Agent operates on an approval-based model. The agent will propose actions (such as sending an email or modifying a calendar event) and will <strong className="text-foreground">only execute them after you explicitly approve</strong>.</p>

        <h2 className="text-xl font-semibold text-foreground">6. Limitation of Liability</h2>
        <p className="text-muted-foreground">Normy Agent is provided "as is" without warranties of any kind. We are not liable for any damages arising from the use of this service, including but not limited to missed emails, scheduling errors, or unintended actions.</p>

        <h2 className="text-xl font-semibold text-foreground">7. Termination</h2>
        <p className="text-muted-foreground">You may stop using the service at any time by disconnecting your accounts and deleting your Normy Agent account. We reserve the right to suspend or terminate accounts that violate these terms.</p>

        <h2 className="text-xl font-semibold text-foreground">8. Changes to Terms</h2>
        <p className="text-muted-foreground">We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the updated terms.</p>
      </section>

      <div className="mt-10">
        <a href="/" className="text-accent hover:underline text-sm">← Back to app</a>
      </div>
    </div>
  </div>
);

export default TermsOfService;
