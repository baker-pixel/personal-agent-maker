import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Mail,
  TrendingUp,
  Users,
  Brain,
  Building2,
  Sparkles,
  Target,
  Zap,
  Rocket,
  Check,
  Briefcase,
  DollarSign,
  Scale,
  Wrench,
  Headphones,
} from "lucide-react";
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
    title: "Built by non-technical entrepreneurs, for non-technical entrepreneurs",
    body: "Most AI is designed by engineers, for engineers. Normy was built by founders who couldn't code — for owners who don't have an IT department. Same caliber of intelligence, zero technical complexity.",
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

const departments = [
  { icon: Headphones, name: "Admin", status: "Live", live: true },
  { icon: Briefcase, name: "Sales", status: "Q3 2026", live: false },
  { icon: Wrench, name: "Operations", status: "Q4 2026", live: false },
  { icon: DollarSign, name: "Finance", status: "2027", live: false },
  { icon: Scale, name: "Legal", status: "2027", live: false },
];

const marqueeWords = [
  "No code",
  "No IT",
  "No consultants",
  "No implementation",
  "No technical debt",
  "No bullshit",
];

export default function Investors() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
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

      {/* Hero with animated gradient blobs */}
      <section className="relative container px-5 pt-16 md:pt-24 pb-12 md:pb-20">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <motion.div
            animate={{ x: [0, 60, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-10 -left-20 w-[420px] h-[420px] rounded-full bg-accent/30 blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -50, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-40 right-0 w-[380px] h-[380px] rounded-full bg-primary/20 blur-3xl"
          />
        </div>

        <motion.div initial="hidden" animate="visible" className="max-w-4xl">
          <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-6 border border-accent/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            Investor relations — actively raising
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-body text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[0.95]"
          >
            AI is being built{" "}
            <span className="relative inline-block">
              <span className="line-through decoration-accent decoration-4">by techies</span>
            </span>
            ,
            <br />
            for techies.
          </motion.h1>

          <motion.p variants={fadeUp} custom={2} className="text-3xl md:text-5xl font-body font-semibold tracking-tight mb-8">
            Normy was built for{" "}
            <span className="bg-gradient-to-r from-accent via-accent to-primary bg-clip-text text-transparent">
              everyone else.
            </span>
          </motion.p>

          <motion.p variants={fadeUp} custom={3} className="text-muted-foreground text-base md:text-lg mb-8 max-w-2xl">
            Built by non-technical entrepreneurs, for non-technical entrepreneurs. We started with Admin and are expanding department by department, turning every SMB into a 10x team — no code, no IT, no implementation required.
          </motion.p>

          <motion.div variants={fadeUp} custom={4} className="flex flex-wrap gap-3">
            <Button
              onClick={() => (window.location.href = "mailto:invest@normyagent.com?subject=Normy%20%E2%80%94%20Investor%20inquiry")}
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shadow-lg shadow-accent/30 hover:shadow-accent/50 transition-all hover:scale-[1.02]"
            >
              Request investor deck <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button onClick={() => navigate("/")} variant="outline" size="lg" className="rounded-xl">
              See the product
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Marquee */}
      <section className="border-y border-border bg-accent/5 py-5 overflow-hidden">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="flex gap-12 whitespace-nowrap"
        >
          {[...marqueeWords, ...marqueeWords, ...marqueeWords, ...marqueeWords].map((w, i) => (
            <div key={i} className="flex items-center gap-12 text-2xl md:text-4xl font-body font-bold tracking-tight">
              <span className="text-foreground/90">{w}</span>
              <span className="text-accent">✦</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Stats */}
      <section className="container px-5 py-16 md:py-24">
        <div className="max-w-2xl mb-10">
          <div className="text-xs font-medium uppercase tracking-wider text-accent mb-3">The opportunity</div>
          <h2 className="font-body text-3xl md:text-5xl font-bold tracking-tight">
            A market this big has never been this underserved.
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl border border-border bg-card p-5 md:p-6 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/0 to-accent/0 group-hover:from-accent/5 group-hover:to-transparent transition-colors" />
              <div className="relative">
                <div className="font-body text-3xl md:text-5xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                  {s.value}
                </div>
                <div className="text-xs md:text-sm font-semibold text-foreground/80 mt-3">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Manifesto pull-quote */}
      <section className="container px-5 pb-16 md:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-3xl bg-foreground text-background p-8 md:p-16 overflow-hidden"
        >
          <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-accent/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative">
            <div className="text-6xl md:text-8xl font-body font-bold text-accent leading-none mb-4">"</div>
            <p className="font-body text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight max-w-4xl">
              We're not selling AI. We're selling the team a small business owner could never afford to hire.
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm text-background/60">
              <div className="w-10 h-px bg-background/30" />
              <span>The Normy thesis</span>
            </div>
          </div>
        </motion.div>
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
              <h2 className="font-body text-2xl md:text-4xl font-bold tracking-tight mb-3">
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
          <div className="text-xs font-medium uppercase tracking-wider text-accent mb-3">Why we win</div>
          <h2 className="font-body text-3xl md:text-5xl font-bold tracking-tight mb-3">Four structural advantages.</h2>
          <p className="text-muted-foreground text-lg">Each one compounds the next.</p>
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
                whileHover={{ y: -4 }}
                className="group relative rounded-2xl border border-border bg-card p-6 overflow-hidden"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-accent/0 group-hover:bg-accent/10 blur-2xl transition-colors duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">0{i + 1}</div>
                  </div>
                  <h3 className="font-body text-lg md:text-xl font-bold mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Department roadmap */}
      <section className="container px-5 pb-16 md:pb-24">
        <div className="max-w-2xl mb-10">
          <div className="text-xs font-medium uppercase tracking-wider text-accent mb-3">The roadmap</div>
          <h2 className="font-body text-3xl md:text-5xl font-bold tracking-tight mb-3">
            One trusted department at a time.
          </h2>
          <p className="text-muted-foreground text-lg">Every new department = new ARR per customer at near-zero CAC.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {departments.map((d, i) => {
            const Icon = d.icon;
            return (
              <motion.div
                key={d.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className={`relative rounded-2xl border p-5 ${
                  d.live
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <Icon className="w-6 h-6 mb-3" />
                <div className="font-body font-bold text-lg">{d.name}</div>
                <div className={`text-xs mt-1 ${d.live ? "text-accent-foreground/80" : "text-muted-foreground"}`}>
                  {d.status}
                </div>
                {d.live && (
                  <div className="absolute top-3 right-3 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-foreground opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-foreground" />
                  </div>
                )}
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
            <h2 className="font-body text-2xl md:text-3xl font-bold tracking-tight">Traction & product</h2>
          </div>
          <ul className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            {traction.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm md:text-base text-foreground/90">
                <Check className="mt-1 w-4 h-4 text-accent shrink-0" />
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
            <h3 className="font-body text-xl md:text-2xl font-bold mb-2">The vision</h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Every small business will have a full back-office team of AI agents within five years. Normy is building that team — one trusted department at a time, with humans always in the loop.
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-6 md:p-8">
            <div className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center mb-4">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="font-body text-xl md:text-2xl font-bold mb-2">Let's talk.</h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
              We're selectively raising from operators and funds who understand SMB GTM and applied AI. Reach out for the deck, financial model, or a product walkthrough.
            </p>
            <Button
              onClick={() => (window.location.href = "mailto:invest@normyagent.com?subject=Normy%20%E2%80%94%20Investor%20inquiry")}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shadow-lg shadow-accent/30"
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
            <span className="font-body font-semibold text-foreground">Normy Agent</span>
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
