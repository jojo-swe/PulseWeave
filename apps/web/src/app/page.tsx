import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { Navbar } from "@/components/landing/Navbar";
import { TechStack } from "@/components/landing/TechStack";

export default function Home() {
  return (
    <main className="min-h-screen selection:bg-primary/30">
      <Navbar />
      <Hero />
      <Features />
      <TechStack />
      <Footer />
    </main>
  );
}
