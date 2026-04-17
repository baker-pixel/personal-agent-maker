const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="font-display text-xl md:text-2xl text-foreground">{title}</h2>
    <div className="text-muted-foreground space-y-2 leading-relaxed">{children}</div>
  </div>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc pl-6 space-y-1">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-16">
      <h1 className="font-display text-4xl md:text-5xl text-foreground mb-2">Privacy Policy for Normy</h1>
      <p className="text-muted-foreground text-sm mb-10">Effective Date: January 1, 2026</p>

      <p className="text-muted-foreground leading-relaxed mb-10">
        Normy ("Company," "we," "us," or "our") respects your privacy and is committed to protecting the personal information you provide when using our website, applications, and services (collectively, the "Services"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information.
      </p>

      <div className="space-y-10">
        <Section title="1. Information We Collect">
          <p>We collect information in the following categories:</p>
          <p className="font-semibold text-foreground pt-2">a. Information You Provide Directly</p>
          <List items={[
            "Name, email address, and contact details",
            "Account credentials",
            "Payment and billing information",
            "Communications with us (e.g., support inquiries)",
            "Any content, data, or instructions you provide through the Services",
          ]} />
          <p className="font-semibold text-foreground pt-2">b. Automatically Collected Information</p>
          <List items={[
            "IP address and device identifiers",
            "Browser type and operating system",
            "Usage data (pages visited, actions taken, timestamps)",
            "Cookies and similar tracking technologies",
          ]} />
          <p className="font-semibold text-foreground pt-2">c. Third-Party Information</p>
          <p>We may receive information from third-party services you connect to Normy, such as:</p>
          <List items={["Email providers", "Calendar platforms", "Other integrated tools or applications"]} />
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use collected information to:</p>
          <List items={[
            "Provide, operate, and improve the Services",
            "Personalize user experience and interactions",
            "Process transactions and manage accounts",
            "Communicate with you (including updates, service notices, and support)",
            "Ensure security and prevent fraud or misuse",
            "Comply with legal obligations",
          ]} />
        </Section>

        <Section title="3. How We Share Information">
          <p><strong className="text-foreground">We do not sell your personal information.</strong></p>
          <p>We may share information in the following circumstances:</p>
          <List items={[
            "Service Providers: With trusted third parties who perform services on our behalf (e.g., hosting, payment processing, analytics)",
            "Integrations: When you connect third-party services, data may be shared as necessary to enable functionality",
            "Legal Requirements: If required by law, regulation, or legal process",
            "Business Transfers: In connection with a merger, acquisition, or sale of assets",
          ]} />
        </Section>

        <Section title="4. Data Retention">
          <p>We retain personal information only as long as necessary to:</p>
          <List items={[
            "Provide the Services",
            "Fulfill the purposes outlined in this Policy",
            "Comply with legal and regulatory obligations",
          ]} />
          <p>When no longer required, data will be securely deleted or anonymized.</p>
        </Section>

        <Section title="5. Security">
          <p>We implement reasonable administrative, technical, and organizational measures to protect your information.</p>
          <p>That said, no system is completely secure. Use of the Services is at your own risk.</p>
        </Section>

        <Section title="6. Your Rights and Choices">
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <List items={[
            "Access, correct, or delete your personal information",
            "Object to or restrict certain processing",
            "Withdraw consent where applicable",
            "Request data portability",
          ]} />
          <p>You may also opt out of non-essential communications at any time.</p>
        </Section>

        <Section title="7. Cookies and Tracking">
          <p>We use cookies and similar technologies to:</p>
          <List items={[
            "Maintain session functionality",
            "Analyze usage patterns",
            "Improve performance and user experience",
          ]} />
          <p>You can control cookies through your browser settings.</p>
        </Section>

        <Section title="8. Third-Party Services">
          <p>Normy may contain links or integrations with third-party services. We are not responsible for their privacy practices. You should review their policies independently.</p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>The Services are not intended for individuals under the age of 13. We do not knowingly collect personal information from children.</p>
        </Section>

        <Section title="10. International Data Transfers">
          <p>If you access the Services from outside the United States, your information may be transferred to and processed in the United States or other jurisdictions.</p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. Changes will be posted with an updated effective date. Continued use of the Services constitutes acceptance of the revised Policy.</p>
        </Section>

        <Section title="12. Contact Information">
          <p>Normy</p>
        </Section>
      </div>

      <div className="mt-12 pt-6 border-t">
        <a href="/" className="text-accent hover:underline text-sm">← Back to app</a>
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
