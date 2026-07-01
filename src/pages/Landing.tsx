import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Mail, Calendar, Users, BarChart3, BookOpen, Briefcase, Sparkles, Menu, X, HeartHandshake, Fingerprint } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
};

const departments = [
  { name: "Admin", icon: Mail, available: true, desc: "Email, calendar, and daily operations" },
  { name: "HR", icon: Users, available: false, desc: "Hiring, onboarding, and team management" },
  { name: "Marketing", icon: BarChart3, available: false, desc: "Campaigns, content, and social media" },
  { name: "Bookkeeping", icon: BookOpen, available: false, desc: "Invoices, expenses, and reporting" },
];

const steps = [
  { num: "01", title: "Name your agent", desc: "Give your AI assistant a name that feels right for your business." },
  { num: "02", title: "Connect your tools", desc: "Link your email and calendar in seconds. No tech skills needed." },
  { num: "03", title: "Let your agent handle the work", desc: "Your agent reads, prioritizes, and drafts — you approve." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const goOnboard = () => { setMenuOpen(false); navigate("/auth?mode=signup"); };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b pt-[env(safe-area-inset-top)]">
        <div className="container flex items-center justify-between h-14 md:h-16 px-4">
          <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => navigate("/")}>
            <img src={normyLogo} alt="Normy" className="h-7 md:h-8 w-auto" />
          </div>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-3">
            <Button onClick={() => navigate("/pricing")} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm px-3">Pricing</Button>
            <Button onClick={() => navigate("/investors")} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm px-3">Investors</Button>
            <Button onClick={() => navigate("/auth")} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm px-3">Log In</Button>
            <Button onClick={goOnboard} variant="default" size="sm" className="text-sm px-3">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
          {/* Mobile nav toggle */}
          <div className="flex md:hidden items-center gap-2">
            <Button onClick={goOnboard} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs px-2.5 h-9">
              Get Started
            </Button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-md px-4 pb-4 pt-2 space-y-1">
            <button onClick={() => { setMenuOpen(false); navigate("/pricing"); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Pricing
            </button>
            <button onClick={() => { setMenuOpen(false); navigate("/investors"); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Investors
            </button>
            <button onClick={() => { setMenuOpen(false); navigate("/auth"); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Log In
            </button>
          </div>
        )}
      </nav>

      <section className="pt-36 pb-10 md:pt-44 md:pb-16">
        <div className="container max-w-4xl text-center px-5">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="flex items-center justify-center gap-2 md:gap-3 mb-5 md:mb-8">
            <img src={normyLogo} alt="Normy Agent" className="h-12 sm:h-16 md:h-32 lg:h-40 w-auto" />
            <span className="font-display text-3xl sm:text-4xl md:text-7xl lg:text-8xl font-bold tracking-tight" style={{ color: '#1e3a5f' }}>Agent</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="font-display text-2xl sm:text-4xl md:text-7xl lg:text-8xl font-bold leading-[1.08] tracking-tight mb-4 md:mb-6">Your AI Business Team</motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="text-muted-foreground text-sm sm:text-base md:text-xl max-w-2xl mx-auto mb-3 md:mb-4">
            AI has so much potential to help your small business. But, AI is being built by techies — for techies.{" "}
            <span className="text-accent font-semibold">Normy Agent</span> was built for everyone else.
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }} className="text-muted-foreground text-sm sm:text-base md:text-xl max-w-2xl mx-auto mb-7 md:mb-10">
            Built <span className="font-bold uppercase">By</span> non-technical entrepreneurs, <span className="font-bold uppercase">For</span> non-technical entrepreneurs.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.4 }}>
            <Button onClick={goOnboard} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm md:text-base px-6 md:px-8 py-5 md:py-6 rounded-xl shadow-lg shadow-accent/20 w-full sm:w-auto">
              Start with your Admin Agent <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-20 bg-card">
        <div className="container max-w-4xl px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center">
            <motion.p variants={fadeUp} custom={0} className="text-accent font-medium text-sm tracking-widest uppercase mb-4">The Problem</motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl md:text-5xl font-bold tracking-tight mb-5 md:mb-6">Small businesses are the backbone of the economy</motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto mb-10 md:mb-12">But their owners wear too many hats. Without the capital to hire specialists, critical tasks fall through the cracks — and growth stalls.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              { icon: Briefcase, title: "Too many hats", desc: "You're the CEO, admin, marketer, and bookkeeper — all at once." },
              { icon: Users, title: "Can't afford to hire", desc: "Specialists cost money most small businesses don't have." },
              { icon: BarChart3, title: "Growth stalls", desc: "When you're buried in operations, strategy takes a back seat." },
            ].map((item, i) => (
              <motion.div key={item.title} variants={fadeUp} custom={i + 3} className="bg-background rounded-xl p-5 md:p-6 border">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4"><item.icon className="w-5 h-5 text-accent" /></div>
                <h3 className="font-display text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="container max-w-5xl px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center mb-10 md:mb-14">
            <motion.p variants={fadeUp} custom={0} className="text-accent font-medium text-sm tracking-widest uppercase mb-4">The Solution</motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl md:text-5xl font-bold tracking-tight mb-4">AI agents organized by department</motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">Normy Agent gives you a team of AI agents, each one a specialist in a key area of your business. Operate like a big enterprise without the necessary capital by leveraging AI, designed for non-techies.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {departments.map((dept, i) => (
              <motion.div key={dept.name} variants={fadeUp} custom={i + 3} className={`rounded-xl border p-4 md:p-6 relative overflow-hidden transition-shadow ${dept.available ? "bg-background shadow-md hover:shadow-lg" : "bg-muted/50 opacity-70"}`}>
                {!dept.available && <span className="absolute top-2 right-2 md:top-3 md:right-3 text-[10px] md:text-xs font-medium text-muted-foreground bg-muted px-1.5 md:px-2 py-0.5 rounded-full">Coming Soon</span>}
                {dept.available && <span className="absolute top-2 right-2 md:top-3 md:right-3 text-[10px] md:text-xs font-medium text-accent-foreground bg-accent px-1.5 md:px-2 py-0.5 rounded-full">Available</span>}
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center mb-3 md:mb-4 ${dept.available ? "bg-accent/10" : "bg-muted"}`}>
                  <dept.icon className={`w-5 h-5 md:w-6 md:h-6 ${dept.available ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <h3 className="font-display text-base md:text-xl font-semibold mb-1">{dept.name}</h3>
                <p className="text-muted-foreground text-xs md:text-sm">{dept.desc}</p>
                {dept.available && <p className="text-accent font-semibold text-xs md:text-sm mt-2">$20/month, no contract</p>}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-20 bg-card">
        <div className="container max-w-4xl px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center mb-10 md:mb-14">
            <motion.p variants={fadeUp} custom={0} className="text-accent font-medium text-sm tracking-widest uppercase mb-4">How It Works</motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl md:text-5xl font-bold tracking-tight">Three steps to your AI team</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="space-y-4 md:space-y-8">
            {steps.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp} custom={i + 2} className="flex items-start gap-4 md:gap-6 bg-background rounded-xl border p-4 md:p-6">
                <span className="text-accent font-display text-2xl md:text-3xl font-bold leading-none mt-0.5">{step.num}</span>
                <div>
                  <h3 className="font-display text-lg md:text-xl font-semibold mb-1">{step.title}</h3>
                  <p className="text-muted-foreground text-sm md:text-base">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container max-w-3xl text-center px-5">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <motion.h2 variants={fadeUp} custom={0} className="font-display text-2xl md:text-5xl font-bold tracking-tight mb-5 md:mb-6">Ready to stop wearing every hat?</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-muted-foreground text-base md:text-lg mb-8 md:mb-10">Set up your Admin Agent in under 2 minutes. No credit card required.</motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <Button onClick={goOnboard} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm md:text-base px-6 md:px-8 py-5 md:py-6 rounded-xl shadow-lg shadow-accent/20 w-full sm:w-auto">
                Set up your Admin Agent <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <footer className="py-6 md:py-8 border-t">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground px-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center"><Sparkles className="w-3 h-3 text-accent-foreground" /></div>
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
