import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Mail, Sparkles, CheckCircle2 } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be less than 100 characters" }),
  email: z
    .string()
    .trim()
    .email({ message: "Please enter a valid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
  firm: z
    .string()
    .trim()
    .max(150, { message: "Firm name must be less than 150 characters" })
    .optional()
    .or(z.literal("")),
  role: z
    .string()
    .trim()
    .max(150, { message: "Role must be less than 150 characters" })
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(1, { message: "Please add a short message" })
    .max(1500, { message: "Message must be less than 1500 characters" }),
});

type ContactFormValues = z.infer<typeof contactSchema>;
type FieldErrors = Partial<Record<keyof ContactFormValues, string>>;

const INITIAL: ContactFormValues = { name: "", email: "", firm: "", role: "", message: "" };

export default function InvestorContact() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [values, setValues] = useState<ContactFormValues>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const setField = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = contactSchema.safeParse(values);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ContactFormValues;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast({
        title: "Please fix the highlighted fields",
        description: "A few details are missing or invalid.",
        variant: "destructive",
      });
      return;
    }

    const { name, email, firm, role, message } = result.data;
    const subject = `Normy — Investor inquiry from ${name}${firm ? ` (${firm})` : ""}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      firm ? `Firm: ${firm}` : null,
      role ? `Role: ${role}` : null,
      "",
      "Message:",
      message,
    ]
      .filter(Boolean)
      .join("\n");

    const mailto = `mailto:invest@normyagent.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    setSubmitted(true);
    toast({
      title: "Thanks — your email client is opening",
      description: "We'll respond within one business day with the deck.",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center justify-between py-3 px-5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src={normyLogo} alt="Normy" className="h-7 w-auto" />
          </button>
          <Button
            onClick={() => navigate("/investors")}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground text-xs md:text-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to investors
          </Button>
        </div>
      </header>

      <section className="container px-5 pt-12 md:pt-20 pb-16 md:pb-24 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Investor relations
          </div>
          <h1 className="font-body text-3xl md:text-5xl font-semibold tracking-tight mb-4">
            Request the investor deck
          </h1>
          <p className="text-muted-foreground text-base md:text-lg mb-10">
            Tell us a bit about you and we'll send the deck, financial model, and a product walkthrough within one business day.
          </p>
        </motion.div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-8"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-body text-2xl font-semibold mb-2">Email client opened</h2>
                <p className="text-muted-foreground text-sm md:text-base mb-6">
                  If nothing happened, send your message directly to{" "}
                  <a href="mailto:invest@normyagent.com" className="text-accent font-medium hover:underline">
                    invest@normyagent.com
                  </a>
                  .
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => navigate("/investors")} variant="outline" className="rounded-xl">
                    Back to investors
                  </Button>
                  <Button
                    onClick={() => {
                      setValues(INITIAL);
                      setSubmitted(false);
                    }}
                    className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
                  >
                    Send another
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={values.name}
                  onChange={(e) => setField("name", e.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                {errors.name && (
                  <p id="name-error" className="text-xs text-destructive">
                    {errors.name}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  onChange={(e) => setField("email", e.target.value)}
                  maxLength={255}
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="firm">Firm</Label>
                <Input
                  id="firm"
                  value={values.firm}
                  onChange={(e) => setField("firm", e.target.value)}
                  maxLength={150}
                  placeholder="Optional"
                  aria-invalid={!!errors.firm}
                />
                {errors.firm && <p className="text-xs text-destructive">{errors.firm}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={values.role}
                  onChange={(e) => setField("role", e.target.value)}
                  maxLength={150}
                  placeholder="Partner, Angel, etc."
                  aria-invalid={!!errors.role}
                />
                {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={values.message}
                onChange={(e) => setField("message", e.target.value)}
                maxLength={1500}
                rows={6}
                placeholder="A few words on your thesis, check size, or anything you'd like to see in the deck."
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? "message-error" : undefined}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{errors.message && <span id="message-error" className="text-destructive">{errors.message}</span>}</span>
                <span>{values.message.length}/1500</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                Send request <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <a
                href="mailto:invest@normyagent.com"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Mail className="w-4 h-4" />
                Or email us directly
              </a>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
