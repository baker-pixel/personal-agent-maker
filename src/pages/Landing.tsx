import { useNavigate } from "react-router-dom";
import { Sparkles, Mail, Calendar, Brain, Shield, Clock, ArrowRight, CheckCircle2, Star, Zap, Users, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Mail,
    title: "Smart Email Triage",
    desc: "AI categorizes every email — urgent, needs reply, FYI, newsletter. Draft responses appear in your approval inbox.",
  },
  {
    icon: Calendar,
    title: "Meeting Prep Cards",
    desc: "Attendee context, talking points, and relevant docs surfaced automatically before every meeting.",
  },
  {
    icon: Brain,
    title: "Morning Briefing",
    desc: "Your day at a glance — schedule conflicts, priority emails, follow-ups due, and action items.",
  },
  {
    icon: Clock,
    title: "Follow-Up Tracker",
    desc: "Never drop a thread. Normy detects unanswered emails and nudges you with draft replies.",
  },
  {
    icon: Shield,
    title: "Trust-Based Delegation",
    desc: "Set autonomy levels from 'approve everything' to 'exception-only.' You're always in control.",
  },
  {
    icon: BarChart3,
    title: "Weekly Intelligence",
    desc: "AI-generated reports summarizing completed tasks, key decisions, and relationship insights.",
  },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Operations, Meridian",
    quote: "Normy saved me 12 hours a week. It's like having a chief of staff who never sleeps.",
    rating: 5,
  },
  {
    name: "Marcus Webb",
    role: "Managing Director, Atlas Capital",
    quote: "The meeting prep cards alone are worth it. I walk into every call fully briefed.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "CEO, Lumina Health",
    quote: "I finally have inbox zero — and it happened on autopilot. This is the future of executive productivity.",
    rating: 5,
  },
];

const stats = [
  { value: "12h", label: "Saved per week" },
  { value: "94%", label: "Email accuracy" },
  { value: "3x", label: "Faster prep" },
  { value: "0", label: "Dropped follow-ups" },
];

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center ring-1 ring-accent/20">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <span className="font-display text-xl tracking-tight">Normy</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/auth")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-md hover:shadow-lg"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-6">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-accent/[0.05] blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-accent/8 border border-accent/15 text-accent text-xs font-semibold px-4 py-1.5 rounded-full mb-8 animate-fade-up">
            <Zap className="w-3.5 h-3.5" />
            AI-Powered Executive Assistant
          </div>

          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl tracking-tight leading-[0.95] mb-7 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            Your day,{" "}
            <span className="text-gradient">brilliantly</span>
            <br />managed.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            Normy triages your inbox, preps your meetings, tracks your follow-ups, and keeps you ahead — all from a single conversation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <button
              onClick={() => navigate("/auth")}
              className="group flex items-center gap-2.5 bg-primary text-primary-foreground font-semibold text-base px-8 py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
            >
              Start for free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-6 py-4"
            >
              See how it works ↓
            </a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border/30 bg-muted/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <div key={i} className={`py-8 md:py-10 text-center ${i < stats.length - 1 ? 'border-r border-border/30' : ''}`}>
              <div className="font-display text-3xl md:text-4xl text-foreground mb-1">{s.value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Demo Video */}
      <section className="py-20 md:py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-5xl tracking-tight mb-4">
              See Normy <span className="text-gradient">in action</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Watch how Normy manages your day — from email triage to meeting prep to approval workflows.
            </p>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-border/30 shadow-xl bg-card">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto block"
              poster=""
            >
              <source src="/normy-demo.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-5xl tracking-tight mb-4">
              Everything a world-class EA does.
              <br />
              <span className="text-muted-foreground">Automated.</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Normy handles the operational load so you can focus on what only you can do — lead.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={i}
                className="group glass-card-hover rounded-2xl p-7 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-accent/40 via-accent/10 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                <div className="w-11 h-11 rounded-xl bg-accent/8 flex items-center justify-center mb-5 ring-1 ring-accent/10 group-hover:ring-accent/25 transition-all">
                  <f.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-display text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Approval Inbox preview */}
      <section className="py-24 md:py-32 px-6 bg-muted/20 border-y border-border/20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-accent/8 border border-accent/15 text-accent text-xs font-semibold px-3 py-1 rounded-full mb-6">
                <Shield className="w-3 h-3" />
                You're always in control
              </div>
              <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-4">
                AI drafts it.<br />
                <span className="text-muted-foreground">You approve it.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Normy never sends anything without your permission. Every email reply goes through your Approval Inbox first. Edit, approve, or dismiss with one tap.
              </p>
              <div className="space-y-3">
                {[
                  "AI drafts replies based on email context",
                  "Edit inline before sending",
                  "One-tap approve sends via your Gmail",
                  "Full history of sent and dismissed drafts",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-lg space-y-3">
                {[
                  { name: "Marcus Chen", subject: "Re: Q3 partnership proposal", status: "pending" },
                  { name: "Sarah Kim", subject: "Re: Contract timeline", status: "sent" },
                  { name: "David Park", subject: "Re: Product demo next week", status: "pending" },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-xl p-3 border ${
                    item.status === "sent" ? "border-success/20 bg-success/5" : "border-border/40"
                  }`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.status === "sent" ? "bg-success/10" : "bg-accent/10"
                    }`}>
                      {item.status === "sent" ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <Mail className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.subject}</p>
                    </div>
                    {item.status === "pending" ? (
                      <div className="flex gap-1.5">
                        <div className="px-2 py-1 rounded-md bg-muted text-[10px] font-medium text-muted-foreground">Edit</div>
                        <div className="px-2 py-1 rounded-md bg-accent text-[10px] font-medium text-accent-foreground">Send</div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium text-success">Sent ✓</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="absolute -bottom-3 -right-3 w-24 h-24 rounded-full bg-accent/[0.06] blur-2xl pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 md:py-32 px-6 bg-muted/10 border-y border-border/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-5xl tracking-tight mb-4">
              Three steps to a<br />
              <span className="text-gradient">10x day</span>
            </h2>
          </div>

          <div className="space-y-0">
            {[
              { step: "01", title: "Connect your tools", desc: "Link Gmail & Google Calendar. Normy starts learning your patterns immediately." },
              { step: "02", title: "Set your preferences", desc: "Tell Normy what matters — urgency thresholds, VIP contacts, delegation levels." },
              { step: "03", title: "Let Normy work", desc: "Wake up to a briefing, triaged inbox, and prepped meetings. Review and approve with one tap." },
            ].map((s, i) => (
              <div key={i} className="flex gap-6 md:gap-10 py-8 border-b border-border/20 last:border-0">
                <div className="font-display text-4xl md:text-5xl text-accent/20 flex-shrink-0 w-16 text-right">{s.step}</div>
                <div>
                  <h3 className="font-display text-xl md:text-2xl text-foreground mb-2">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-5xl tracking-tight mb-4">
              Trusted by leaders who<br />
              <span className="text-muted-foreground">demand excellence</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="glass-card rounded-2xl p-7 flex flex-col">
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-accent fill-accent" />
                  ))}
                </div>
                <p className="text-foreground text-sm leading-relaxed flex-1 mb-6">
                  "{t.quote}"
                </p>
                <div>
                  <div className="font-semibold text-sm text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 -m-12 rounded-3xl bg-accent/[0.04] blur-2xl pointer-events-none" />
            <div className="relative glass-card rounded-3xl p-12 md:p-16">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-7 ring-1 ring-accent/20 animate-glow-pulse">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <h2 className="font-display text-3xl md:text-5xl tracking-tight mb-4">
                Ready to reclaim your day?
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Join executives who've already made the switch. Free to start, no credit card required.
              </p>
              <button
                onClick={() => navigate("/auth")}
                className="group inline-flex items-center gap-2.5 bg-primary text-primary-foreground font-semibold text-base px-8 py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
              >
                Get started free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <div className="flex items-center justify-center gap-5 mt-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Free tier included</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> No credit card</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-display text-sm">Normy</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <span>© {new Date().getFullYear()} Normy. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
