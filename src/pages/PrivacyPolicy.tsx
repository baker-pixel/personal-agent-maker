const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background p-6 md:p-12">
    <div className="max-w-3xl mx-auto prose prose-invert">
      <h1 className="font-display text-3xl text-foreground mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="space-y-4 text-foreground/90">
        <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
        <p>When you use Normy Agent, we collect the following information:</p>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li><strong className="text-foreground">Account information:</strong> Email address and password when you create an account.</li>
          <li><strong className="text-foreground">Google account data:</strong> When you connect Gmail or Google Calendar, we access your emails and calendar events to provide triage and scheduling features. We store OAuth tokens securely to maintain your connection.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>To read and categorize your emails for inbox triage</li>
          <li>To read your calendar events for scheduling optimization</li>
          <li>To draft email replies for your review and approval</li>
          <li>To detect calendar conflicts and suggest resolutions</li>
        </ul>
        <p className="text-muted-foreground">We <strong className="text-foreground">never</strong> send emails or modify calendar events without your explicit approval.</p>

        <h2 className="text-xl font-semibold text-foreground">3. Data Storage & Security</h2>
        <p className="text-muted-foreground">Your OAuth tokens are stored securely in an encrypted database. We do not store the full content of your emails or calendar events — we access them in real time when needed and do not retain copies.</p>

        <h2 className="text-xl font-semibold text-foreground">4. Third-Party Services</h2>
        <p className="text-muted-foreground">We use Google APIs to access Gmail and Google Calendar. Our use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

        <h2 className="text-xl font-semibold text-foreground">5. Data Sharing</h2>
        <p className="text-muted-foreground">We do not sell, trade, or share your personal data with third parties. Your data is only used to provide the Normy Agent service.</p>

        <h2 className="text-xl font-semibold text-foreground">6. Your Rights</h2>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>You can disconnect your Google account at any time from the Integrations page</li>
          <li>You can delete your account and all associated data at any time</li>
          <li>You can revoke Normy Agent's access from your <a href="https://myaccount.google.com/permissions" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google Account permissions</a></li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">7. Contact</h2>
        <p className="text-muted-foreground">If you have questions about this privacy policy, please contact us through the app.</p>
      </section>

      <div className="mt-10">
        <a href="/" className="text-accent hover:underline text-sm">← Back to app</a>
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
