import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Mail, BarChart3, Users, BookOpen, Settings, Check, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const adminFeatures = [
  "Email triage & smart prioritization",
  "Draft replies in your voice",
  "Calendar management & scheduling",
  "Meeting prep briefs",
  "End-of-day wrap-up summaries",
  "Follow-up tracking",
  "Contact intelligence",
  "Morning briefing",
  "Document summarization",
  "The world's first behavioral agentic reasoning system.",
];

const departments = [
  {
    name: "Admin",
    subtitle: "Your AI Executive Assistant",
    icon: Mail,
    available: true,
    price: "$20",
    period: "/month",
    desc: "Email, calendar, and daily operations handled by your AI agent. Interact with your Admin Agent via Voice/Email/SMS, all while you stay focused on growing your business.",
    features: adminFeatures,
    detail: null,
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Marketing",
    subtitle: "AI Marketing Manager",
    icon: BarChart3,
    available: false,
    price: null,
    period: null,
    desc: "Campaigns, content calendar, social media scheduling, and performance analytics — all managed by AI.",
    features: [
      "Social media content & scheduling",
      "Campaign performance tracking",
      "Content calendar management",
      "Competitor monitoring",
      "Email marketing automation",
    ],
    detail: {
      headline: "Your always-on marketing department",
      paragraphs: [
        "Normy's Marketing Agent acts as a dedicated marketing manager who never sleeps. It drafts and schedules social media posts across platforms, monitors engagement metrics, and suggests content optimizations based on what's performing — so you stay visible without spending hours on social media.",
        "Need an email campaign? Describe your goal and the agent drafts the copy, segments your audience, and schedules the send. It tracks open rates, click-throughs, and conversions — then summarizes results in a plain-English report each week.",
        "The agent also monitors your competitors' public activity — new product launches, social campaigns, pricing changes — and flags anything relevant so you can respond quickly. Think of it as a marketing team that fits in your pocket.",
      ],
      extras: [
        "AI-generated social captions & hashtags",
        "Automated A/B test suggestions",
        "Weekly marketing performance digest",
        "Brand voice consistency enforcement",
        "SEO keyword tracking & content recommendations",
      ],
    },
    cta: "Join Waitlist",
    highlight: false,
  },
  {
    name: "HR",
    subtitle: "AI People Operations",
    icon: Users,
    available: false,
    price: null,
    period: null,
    desc: "Hiring, onboarding, team management, and employee communications — streamlined with AI.",
    features: [
      "Job posting & candidate screening",
      "Onboarding workflow automation",
      "Employee communications",
      "Time-off & schedule management",
      "Performance review prep",
    ],
    detail: {
      headline: "Hire, onboard, and manage — hands-free",
      paragraphs: [
        "Normy's HR Agent handles the full employee lifecycle for small teams. It drafts job descriptions tailored to your industry, posts to job boards, and screens incoming resumes against your criteria — surfacing only the top candidates for your review.",
        "Once you hire, the agent creates a personalized onboarding checklist: welcome emails, document collection, tool access setup, and first-week introductions — all triggered automatically. No more scrambling on day one.",
        "For ongoing management, the agent tracks PTO requests, sends reminders for performance reviews, and drafts company-wide communications. It ensures nothing falls through the cracks — even when your team is growing fast.",
      ],
      extras: [
        "AI-scored resume screening",
        "Custom onboarding checklists per role",
        "Automated new-hire welcome sequences",
        "PTO balance tracking & approval routing",
        "Performance review question generation",
        "Employee satisfaction pulse surveys",
      ],
    },
    cta: "Join Waitlist",
    highlight: false,
  },
  {
    name: "Bookkeeping",
    subtitle: "AI Financial Assistant",
    icon: BookOpen,
    available: false,
    price: null,
    period: null,
    desc: "Invoices, expense tracking, financial reporting, and tax prep support — powered by AI.",
    features: [
      "Invoice creation & tracking",
      "Expense categorization",
      "Monthly financial summaries",
      "Cash flow monitoring",
      "Tax prep document organization",
    ],
    detail: {
      headline: "Financial clarity without the spreadsheet headaches",
      paragraphs: [
        "Normy's Bookkeeping Agent automatically categorizes your transactions, flags unusual expenses, and generates clean monthly financial summaries — no accounting degree required. It reads receipts, matches them to transactions, and keeps your books organized year-round.",
        "Need to send an invoice? Describe the work and the agent creates a professional invoice, tracks payment status, and sends polite follow-ups for overdue balances. It also monitors your cash flow and alerts you before potential shortfalls.",
        "When tax season arrives, the agent compiles all relevant documents — categorized expenses, income summaries, deduction candidates — and packages them for your accountant. What used to take days of prep now takes minutes.",
      ],
      extras: [
        "Receipt scanning & auto-categorization",
        "Overdue invoice reminders",
        "Cash flow forecasting alerts",
        "Profit & loss statement generation",
        "Tax-deductible expense flagging",
        "Quarterly estimated tax reminders",
      ],
    },
    cta: "Join Waitlist",
    highlight: false,
  },
  {
    name: "Operations",
    subtitle: "AI Operations Manager",
    icon: Settings,
    available: false,
    price: null,
    period: null,
    desc: "Vendor management, inventory, process optimization, and logistics — coordinated by AI.",
    features: [
      "Vendor communication & tracking",
      "Inventory monitoring",
      "Process workflow automation",
      "Quality control checklists",
      "Logistics coordination",
    ],
    detail: {
      headline: "Run tighter operations on autopilot",
      paragraphs: [
        "Normy's Operations Agent keeps your business running smoothly behind the scenes. It tracks vendor contracts, sends renewal reminders, and drafts follow-up communications — so you never miss a deadline or overpay on a lapsed agreement.",
        "For product-based businesses, the agent monitors inventory levels, predicts when you'll need to reorder based on sales velocity, and drafts purchase orders for your approval. It also coordinates shipping logistics and tracks deliveries in real time.",
        "The agent automates recurring operational workflows — equipment maintenance schedules, quality control checklists, compliance deadlines — and reports exceptions so you only deal with what actually needs your attention.",
      ],
      extras: [
        "Vendor contract renewal tracking",
        "Reorder point predictions",
        "Automated purchase order drafts",
        "Shipment tracking & delivery alerts",
        "Maintenance schedule automation",
        "Compliance deadline monitoring",
      ],
    },
    cta: "Join Waitlist",
    highlight: false,
  },
];

const faqs = [
  { q: "Can I cancel anytime?", a: "Yes — no contracts, no commitments. Cancel your subscription at any time with no penalties." },
  { q: "How does the Admin Agent compare to a human EA?", a: "A part-time human EA costs $2,000–$4,000/month. Normy's Admin Agent handles the same daily tasks for $20/month — available 24/7." },
  { q: "What happens to my data?", a: "Your data is encrypted and never shared. We use it only to power your agent's functionality." },
  { q: "Will more departments be added?", a: "Yes! Marketing, HR, Bookkeeping, and Operations agents are actively in development. Join the waitlist to get early access." },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b pt-[env(safe-area-inset-top)]">
        <div className="container flex items-center justify-between h-14 md:h-16 px-4">
          <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => navigate("/")}>
            <img src={normyLogo} alt="Normy" className="h-7 md:h-8 w-auto" />
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            <Button onClick={() => navigate("/auth")} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs md:text-sm px-2 md:px-3">Log In</Button>
            <Button onClick={() => navigate("/onboarding")} variant="default" size="sm" className="text-xs md:text-sm px-2.5 md:px-3">Get Started <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 ml-1" /></Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-10 md:pt-40 md:pb-20">
        <div className="container max-w-5xl text-center px-5">
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-accent font-medium text-sm tracking-widest uppercase mb-4">Pricing</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="font-display text-3xl md:text-6xl font-bold tracking-tight mb-4">Your AI team, one department at a time</motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="text-muted-foreground text-base md:text-xl max-w-2xl mx-auto">Leverage the power of artificial intelligence built specifically for you, the SMB owner/Operator. Start with the Admin Agent today. Zero contract. Add more departments as they launch, each one a specialist that works around the clock to support you.</motion.p>
        </div>
      </section>

      {/* Department Cards — horizontal scroll on mobile, grid on desktop */}
      <section className="pb-20">
        <div className="container max-w-[1400px]">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
            {departments.map((dept, i) => (
              <motion.div
                key={dept.name}
                variants={fadeUp}
                custom={i}
                className={`flex-shrink-0 w-[280px] lg:w-auto snap-center rounded-2xl border flex flex-col relative overflow-hidden transition-shadow ${
                  dept.highlight
                    ? "bg-background shadow-lg ring-2 ring-accent/30"
                    : "bg-card"
                } ${!dept.available ? "opacity-80" : ""}`}
              >
                {/* Badge */}
                {dept.available ? (
                  <span className="absolute top-4 right-4 text-xs font-semibold bg-accent text-accent-foreground px-2.5 py-1 rounded-full">Available</span>
                ) : (
                  <span className="absolute top-4 right-4 text-xs font-medium bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Coming Soon</span>
                )}

                {/* Header */}
                <div className="p-6 pb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${dept.available ? "bg-accent/10" : "bg-muted"}`}>
                    <dept.icon className={`w-5 h-5 ${dept.available ? "text-accent" : "text-muted-foreground"}`} />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-0.5">{dept.name}</h3>
                  <p className="text-muted-foreground text-xs mb-4">{dept.subtitle}</p>

                  {dept.price && (
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className={`font-display text-3xl font-bold ${dept.available ? "text-foreground" : "text-muted-foreground"}`}>{dept.price}</span>
                      {dept.period && <span className="text-muted-foreground text-sm">{dept.period}</span>}
                    </div>
                  )}
                  {dept.available && <p className="text-xs text-muted-foreground mb-1">No contract · Cancel anytime</p>}

                  <p className="text-muted-foreground text-sm mt-3 leading-relaxed">{dept.desc}</p>
                </div>

                {/* Features */}
                <div className="px-6 pb-4 flex-1">
                  <ul className="space-y-2">
                    {dept.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${dept.available ? "text-accent" : "text-muted-foreground/50"}`} />
                        <span className={dept.available ? "text-foreground" : "text-muted-foreground"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Learn More / CTA */}
                <div className="p-6 pt-2 space-y-2">
                  {dept.available ? (
                    <Button onClick={() => navigate("/onboarding")} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      {dept.cta} <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        className="w-full text-accent hover:text-accent/80 hover:bg-accent/5"
                        onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}
                      >
                        {expandedDept === dept.name ? "Show Less" : "Learn More"}
                        {expandedDept === dept.name ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                      </Button>
                      <Button variant="outline" className="w-full" disabled>
                        {dept.cta}
                      </Button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Expanded Detail Panel */}
          <AnimatePresence>
            {expandedDept && (() => {
              const dept = departments.find(d => d.name === expandedDept);
              if (!dept || !dept.detail) return null;
              return (
                <motion.div
                  key={dept.name}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 rounded-2xl border bg-card p-8 md:p-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
                        <dept.icon className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-bold">{dept.name} Agent</h3>
                        <p className="text-muted-foreground text-sm">{dept.subtitle}</p>
                      </div>
                      <button
                        onClick={() => setExpandedDept(null)}
                        className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronUp className="w-5 h-5" />
                      </button>
                    </div>

                    <h4 className="font-display text-2xl font-bold mb-4">{dept.detail.headline}</h4>

                    <div className="space-y-4 mb-8">
                      {dept.detail.paragraphs.map((p, idx) => (
                        <p key={idx} className="text-muted-foreground leading-relaxed">{p}</p>
                      ))}
                    </div>

                    <div>
                      <h5 className="font-display font-semibold text-lg mb-3">Additional capabilities</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {dept.detail.extras.map((e) => (
                          <div key={e} className="flex items-start gap-2 text-sm">
                            <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent" />
                            <span className="text-foreground">{e}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-12 md:py-16 bg-card">
        <div className="container max-w-3xl text-center px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }}>
            <motion.h2 variants={fadeUp} custom={0} className="font-display text-2xl md:text-4xl font-bold tracking-tight mb-4">Normy vs. a Human EA</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-muted-foreground text-base md:text-lg mb-8 md:mb-10">The same daily tasks at a fraction of the cost.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} className="grid grid-cols-2 gap-3 md:gap-6 max-w-xl mx-auto">
            <motion.div variants={fadeUp} custom={2} className="rounded-xl border bg-background p-4 md:p-6 text-center">
              <p className="text-muted-foreground text-xs md:text-sm mb-2">Part-Time Human EA</p>
              <p className="font-display text-xl md:text-3xl font-bold text-foreground">$2,000–$4,000</p>
              <p className="text-muted-foreground text-xs mt-1">/month</p>
            </motion.div>
            <motion.div variants={fadeUp} custom={3} className="rounded-xl border bg-background p-4 md:p-6 text-center ring-2 ring-accent/30">
              <p className="text-accent text-xs md:text-sm font-semibold mb-2">Normy Admin Agent</p>
              <p className="font-display text-xl md:text-3xl font-bold text-foreground">$20</p>
              <p className="text-muted-foreground text-xs mt-1">/month · 24/7</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 md:py-16">
        <div className="container max-w-3xl px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} className="text-center mb-8 md:mb-10">
            <motion.h2 variants={fadeUp} custom={0} className="font-display text-2xl md:text-4xl font-bold tracking-tight">Frequently Asked Questions</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} className="space-y-4 md:space-y-5">
            {faqs.map((faq, i) => (
              <motion.div key={faq.q} variants={fadeUp} custom={i + 1} className="bg-card rounded-xl border p-4 md:p-6">
                <h3 className="font-display font-semibold text-base md:text-lg mb-2">{faq.q}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-14 md:py-20 bg-card">
        <div className="container max-w-3xl text-center px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }}>
            <motion.h2 variants={fadeUp} custom={0} className="font-display text-2xl md:text-5xl font-bold tracking-tight mb-5 md:mb-6">Ready to hire your AI team?</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-muted-foreground text-base md:text-lg mb-8 md:mb-10">Start with the Admin Agent — set up in under 2 minutes. No credit card required.</motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <Button onClick={() => navigate("/onboarding")} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm md:text-base px-6 md:px-8 py-5 md:py-6 rounded-xl shadow-lg shadow-accent/20 w-full sm:w-auto">
                Get Started <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 md:py-8 border-t">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground px-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center"><Sparkles className="w-3 h-3 text-accent-foreground" /></div>
            <span className="font-display font-semibold text-foreground">Normy Agent</span>
          </div>
          <p className="text-xs md:text-sm">© 2026 Normy Agent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
