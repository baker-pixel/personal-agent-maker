import { useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import normyLogo from "@/assets/normy-logo.png";

export default function PreRegisterConfirmation() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "You're on the list — NormyAgent";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="max-w-3xl mx-auto px-6 pt-10 pb-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img src={normyLogo} alt="Normy" className="h-8 w-auto" />
        </a>
        <a href="/pre-register" className="text-sm text-accent hover:underline">Pre-register</a>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-xl w-full text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-accent" />
          </div>

          <h1
            className="text-4xl md:text-6xl leading-[1.0] tracking-tight"
            style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}
          >
            You're on the list.
          </h1>

          <p className="text-lg md:text-xl text-foreground/80 leading-relaxed">
            We'll be in touch the moment NormyAgent opens up. The first non-tech tech is almost here.
          </p>

          <div className="pt-4">
            <Button
              variant="outline"
              onClick={() => navigate("/pre-register")}
              className="h-12 px-6 border-accent/30 text-accent hover:bg-accent/5"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to the manifesto
            </Button>
          </div>
        </motion.div>
      </main>

      <footer className="py-8 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} NormyAgent. Agents for normies.
      </footer>
    </div>
  );
}
