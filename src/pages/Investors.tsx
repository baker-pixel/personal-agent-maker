import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Mail, TrendingUp, Users, Brain, Building2, Sparkles, Target, Zap, Rocket, Check } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const stats = [
  { label: "Target market", value: "$280B", sub: "Global SMB productivity software" },
  { label: "SMBs worldwide", value: "400M+", sub: "Underserved by current AI tools" },
  { label: "Hours saved / week", value: "10–15", sub: "Per knowledge worker, on average" },
  { label: "Founding pricing", value: "$20/mo", sub: "Per agent, per department" },
];

const pillars = [
  {
    icon: Brain,
    title: "Behavioral agentic reasoning",
    body: "Normy is the first agent designed around how an executive assistant actually thinks — trust-based delegation, draft-first actions, and human-in-the-loop approvals.",
  },
  {
    icon: Building2,
    title: "Departmental expansion",
    body: "Admin is live today. Sales, Operations, Finance, and Legal departments are on the roadmap — each unlocking new ARR per customer at near-zero CAC.",
  },
  {
    icon: Target,
    title: "Built for SMBs",
    body: "Enterprise AI assistants are priced for Fortune 500. We've built the same caliber of intelligence at a price point a 10-person business can adopt on day one.",
  },
  {
    icon: Zap,
    title: "Compounding moat",
    body: "Every approved action teaches the agent your voice, your VIPs, your priorities. Switching cost grows with every interaction.",
  },
];

const traction = [
  "Live product with real users across email, calendar, contacts, and tasks",
  "Native Google Workspace integration with read-only, scoped permissions",
  "Multi-channel interface: web, mobile PWA, voice, and SMS",
  "Proactive AI — daily briefings, lead detection, follow-up tracking, EOD wrap-ups",
  "Built on a scalable serverless backend with full RLS isolation per tenant",
];

export default function Investors() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center justify-between py-3 px-5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src={normyLogo} alt="Normy" className="h-7 w-auto" />
          </button>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate("/pricing")} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs md:text-sm">
              Pricing
            </Button>
            <Button
              onClick={() => (window.location.href = "mailto:invest@normyagent.com")}
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs md:text-sm"
            >
              Contact <Mail className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container px-5 pt-16 md:pt-24 pb-12 md:pb-16">
        <motion.div initial="hidden" animate="visible" className="max-w-3xl">
          <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Investor relations
          </motion.div>
          <motion.h1 variants={fadeUp} custom={1} className="font-body text-4xl md:text-6xl font-semibold tracking-tight mb-6">
            Building the agentic workforce for every small business.
          </motion.h1>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground text-base md:text-lg mb-8">
            Normy is the first AI agent designed around the behavior of a trusted executive assistant — not a chatbot. We're starting with Admin and expanding department by department, turning every SMB into a 10x team.
          </motion.p>
          <motion.div variants={fadeUp} custom={3} className="flex flex-wrap gap-3">
            <Button
              onClick={() => (window.location.href = "mailto:invest@normyagent.com?subject=Normy%20%E2%80%94%20Investor%20inquiry")}
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
            >
              Request investor deck <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button onClick={() => navigate("/")} variant="outline" size="lg" className="rounded-xl">
              See the product
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="rounded-2xl border border-border bg-card p-5 md:p-6"
            >
              <div className="font-body text-2xl md:text-4xl font-semibold text-foreground">{s.value}</div>
              <div className="text-xs md:text-sm font-medium text-foreground/80 mt-2">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Out-of-the-box callout */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-6 md:p-10">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-accent mb-2">Zero setup</div>
              <h2 className="font-body text-2xl md:text-4xl font-semibold tracking-tight mb-3">
                Out-of-the-box. No code, no IT, no implementation team.
              </h2>
              <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
                SMBs sign up, connect Google in one click, and Normy starts working in under 60 seconds. No integrations to configure, no workflows to build, no consultants required — a critical unlock for a market that has historically been gated by technical complexity.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 md:gap-4 mt-6">
            {[
              { t: "60-second onboarding", s: "Sign up → connect Google → done." },
              { t: "No code or workflows", s: "Normy learns by watching, not by configuration." },
              { t: "No IT or consultants", s: "A non-technical owner can deploy it solo." },
            ].map((item) => (
              <div key={item.t} className="rounded-2xl bg-background/60 border border-border p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Check className="w-4 h-4 text-accent" />
                  <div className="font-medium text-sm">{item.t}</div>
                </div>
                <div className="text-xs text-muted-foreground">{item.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="max-w-2xl mb-10">
          <h2 className="font-body text-3xl md:text-4xl font-semibold tracking-tight mb-3">Why Normy wins</h2>
          <p className="text-muted-foreground">Four structural advantages that compound over time.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-body text-lg font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Traction */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="rounded-3xl border border-border bg-card p-6 md:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h2 className="font-body text-2xl md:text-3xl font-semibold tracking-tight">Traction & product</h2>
          </div>
          <ul className="space-y-3">
            {traction.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm md:text-base text-foreground/90">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Team / vision */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-body text-xl font-semibold mb-2">The vision</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every small business will have a full back-office team of AI agents within five years. Normy is building that team — one trusted department at a time, with humans always in the loop.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="font-body text-xl font-semibold mb-2">Get in touch</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              We're selectively raising from operators and funds who understand SMB GTM and applied AI. Reach out for the deck, financial model, or a product walkthrough.
            </p>
            <Button
              onClick={() => (window.location.href = "mailto:invest@normyagent.com?subject=Normy%20%E2%80%94%20Investor%20inquiry")}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
            >
              invest@normyagent.com <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 md:py-8 border-t border-border">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground px-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-accent-foreground" />
            </div>
            <span className="font-display font-semibold text-foreground">Normy Agent</span>
          </div>
          <div className="flex items-center gap-4 text-xs md:text-sm">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="/investors" className="hover:text-foreground transition-colors">Investors</a>
          </div>
          <p className="text-xs md:text-sm">© 2026 Normy Agent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
