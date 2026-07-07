import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import normyLogo from "@/assets/normy-logo.png";

const paragraphs: (string | { h: string })[] = [
  "Every transformative technology goes through the same first act: it arrives, it works, and almost nobody can use it.",
  "Cars existed for twenty years as hand-built machines for wealthy hobbyists with mechanics on staff. Photography required chemistry knowledge and a darkroom. Computers belonged to a priesthood of operators in climate-controlled rooms. The early internet was real and revolutionary, but only for people who could configure a TCP/IP stack.",
  "In every case, the capability arrived long before the access. And in every case, the breakthrough that mattered wasn't a better version of the technology. It was the move that deleted the requirement to understand it.",
  "Ford didn't improve the car; he improved the making of it, and the price fell from $850 to $260. Eastman didn't simplify photography; he removed it from the customer's job entirely. \u201CYou press the button, we do the rest.\u201D The chemistry didn't disappear. It moved behind the counter. The GUI didn't teach anyone the command line; it made the command line unnecessary. AOL put the internet on one disc with one password and was sneered at by the technical class the whole way to thirty million users.",
  "Notice what none of them did: none of them taught the masses the technology. Ford didn't run driving schools for mechanics. Eastman didn't teach chemistry. Microsoft didn't teach DOS. Every democratizer in history won by moving complexity from the user's side of the counter to the provider's side.",
  { h: "Now look at AI." },
  "The capability is here. Genuinely, historically here. And it is bottlenecked exactly where every predecessor was: at access. The primary interface is a chat window, a skeuomorph of text messaging. We dressed an alien intelligence as a familiar thread because that's what people knew, the way the first cars were shaped like carriages. The real agentic power \u2014 AI that finds the data, answers the question, and acts on the answer \u2014 is available almost exclusively to a technical class: people who can write system prompts, wire APIs, and orchestrate agent frameworks. A new priesthood, with a new command line.",
  "And what is the industry's answer to this gap? Prompt engineering courses. Agent-building tutorials. \u201CLearn to use AI.\u201D",
  { h: "That's teaching chemistry." },
  "History says the next move \u2014 the one that actually matters \u2014 goes the other direction. Not the company that teaches millions of small business owners to become technical. The company that makes becoming technical unnecessary. The step that doesn't explain the technology but removes it altogether.",
  "The gains from AI over the next decade won't be gated by model capability. The models are sprinting. The gains will be gated by absorption \u2014 by how fast the power reaches the dry cleaner, the dental office, the three-person landscaping company.",
  { h: "That's not a model problem. It's a Model T problem." },
  "And it's the problem we built NormyAgent to solve.",
  "NormyAgent is agentic AI for the normies of the world: the non-technical business owners who don't want to learn prompts, APIs, or frameworks, and shouldn't have to. No command line. No chemistry. You tell it what you need, and it does the rest.",
  "The assembly line is running.",
];

export default function PreRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("preregistrations").insert({ email: value });
    setLoading(false);
    if (error && !/duplicate|unique/i.test(error.message)) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
      return;
    }
    navigate("/pre-register/confirmation", { replace: true });
  };

  useEffect(() => {
    document.title = "The Model T Problem — Pre-register for NormyAgent";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">


      <header className="max-w-3xl mx-auto px-6 pt-10 pb-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img src={normyLogo} alt="Normy" className="h-8 w-auto" />
        </a>
        <a href="#register" className="text-sm text-accent hover:underline">Pre-register</a>
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-24">
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="pt-8"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-accent mb-4">A manifesto</p>
          <h1 className="text-5xl md:text-7xl leading-[1.0] tracking-tight mb-10" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
            The Model T Problem
          </h1>

          <div className="space-y-6 text-lg md:text-xl leading-relaxed text-foreground/85 font-body">
            {paragraphs.map((p, i) =>
              typeof p === "string" ? (
                <p key={i}>{p}</p>
              ) : (
                <h2 key={i} className="text-2xl md:text-3xl text-foreground pt-4" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
                  {p.h}
                </h2>
              )
            )}
          </div>

          <div id="register" className="mt-16 rounded-2xl border border-accent/30 bg-accent/5 p-8 md:p-10">
            <h3 className="text-3xl md:text-4xl leading-tight mb-3" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
              Be first in line for the first non-tech tech.
            </h3>
            <p className="text-base md:text-lg text-foreground/75 mb-6">
              Pre-register today and we'll let you know the moment NormyAgent opens up.
            </p>

            {done ? (
              <div className="rounded-lg bg-background border border-accent/40 p-5 text-center">
                <p className="text-xl mb-1" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>You're on the list.</p>
                <p className="text-sm text-muted-foreground">We'll be in touch at <strong>{email}</strong>.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="email"
                  required
                  placeholder="you@yourbusiness.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-base flex-1"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 px-6 bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
                >
                  {loading ? "Adding…" : "Pre-register"}
                </Button>
              </form>
            )}
          </div>

          <footer className="mt-16 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} NormyAgent. Agents for normies.
          </footer>
        </motion.article>
      </main>
    </div>
  );
}
