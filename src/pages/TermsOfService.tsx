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

const TermsOfService = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-16">
      <h1 className="font-display text-4xl md:text-5xl text-foreground mb-2">Terms of Service for Normy</h1>
      <p className="text-muted-foreground text-sm mb-10">Effective Date: January 1, 2026</p>

      <p className="text-muted-foreground leading-relaxed mb-10">
        These Terms of Service ("Terms") govern your access to and use of the website, applications, and services (collectively, the "Services") provided by Normy ("Company," "we," "us," or "our"). By accessing or using the Services, you agree to be bound by these Terms.
      </p>

      <div className="space-y-10">
        <Section title="1. Use of Services">
          <p>You agree to use the Services only for lawful purposes and in accordance with these Terms. You may not:</p>
          <List items={[
            "Use the Services in any way that violates applicable laws or regulations",
            "Attempt to gain unauthorized access to systems or data",
            "Interfere with or disrupt the integrity or performance of the Services",
            "Use the Services to transmit harmful or malicious content",
          ]} />
        </Section>

        <Section title="2. Accounts">
          <p>You may be required to create an account to access certain features. You are responsible for:</p>
          <List items={[
            "Maintaining the confidentiality of your account credentials",
            "All activities that occur under your account",
          ]} />
          <p>We reserve the right to suspend or terminate accounts at our discretion.</p>
        </Section>

        <Section title="3. Payments and Subscriptions">
          <p>Certain features of the Services may require payment. By purchasing a subscription, you agree:</p>
          <List items={[
            "To provide accurate billing information",
            "That fees may be charged on a recurring basis unless canceled",
            "That all payments are non-refundable unless otherwise stated",
          ]} />
          <p>We may change pricing at any time with notice.</p>
        </Section>

        <Section title="4. Intellectual Property">
          <p>All content, features, and functionality of the Services are owned by Normy or its licensors and are protected by intellectual property laws.</p>
          <p>You are granted a limited, non-exclusive, non-transferable license to use the Services for personal or business use. You may not copy, modify, distribute, or create derivative works without permission.</p>
        </Section>

        <Section title="5. User Content">
          <p>You retain ownership of any content you submit to the Services. By submitting content, you grant Normy a limited license to use, process, and display such content solely to provide and improve the Services.</p>
          <p>You are responsible for ensuring that your content does not violate any laws or rights of third parties.</p>
        </Section>

        <Section title="6. Third-Party Services">
          <p>The Services may integrate with or rely on third-party services. We are not responsible for the availability, accuracy, or practices of such third parties.</p>
        </Section>

        <Section title="7. Disclaimer of Warranties">
          <p>The Services are provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not guarantee that:</p>
          <List items={[
            "The Services will be uninterrupted or error-free",
            "The results obtained from use of the Services will be accurate or reliable",
          ]} />
        </Section>

        <Section title="8. Limitation of Liability">
          <p>To the fullest extent permitted by law, Normy shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Services.</p>
          <p>Our total liability shall not exceed the amount you paid to us in the twelve (12) months preceding the claim.</p>
        </Section>

        <Section title="9. Indemnification">
          <p>You agree to indemnify and hold harmless Normy from any claims, damages, or expenses arising out of your use of the Services or violation of these Terms.</p>
        </Section>

        <Section title="10. Termination">
          <p>We may suspend or terminate your access to the Services at any time, with or without notice, for conduct that we believe violates these Terms. Upon termination, your right to use the Services will immediately cease.</p>
        </Section>

        <Section title="11. Governing Law">
          <p>These Terms shall be governed by and construed in accordance with the laws of the State of Tennessee, without regard to conflict of law principles.</p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>We may update these Terms from time to time. Continued use of the Services after changes are posted constitutes acceptance of the revised Terms.</p>
        </Section>

        <Section title="13. Contact Information">
          <p>Normy</p>
        </Section>
      </div>

      <div className="mt-12 pt-6 border-t">
        <a href="/" className="text-accent hover:underline text-sm">← Back to app</a>
      </div>
    </div>
  </div>
);

export default TermsOfService;
