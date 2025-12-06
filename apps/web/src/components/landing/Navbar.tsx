import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">PulseWeave</span>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <Link href="#features" className="hover:text-primary transition-colors duration-200">Features</Link>
              <Link href="#tech-stack" className="hover:text-primary transition-colors duration-200">Tech Stack</Link>
              <Link href="https://github.com/jojo-swe/PulseWeave" className="hover:text-primary transition-colors duration-200">GitHub</Link>
            </div>
          </div>

          <div>
             <Link href="http://localhost:3000" className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
               Launch App
             </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
