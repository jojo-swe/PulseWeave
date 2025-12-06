export function Footer() {
  return (
    <footer className="py-12 border-t border-white/10 bg-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-muted-foreground text-sm">
          © {new Date().getFullYear()} PulseWeave. Open Source.
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <a href="#" className="hover:text-primary">Privacy</a>
          <a href="#" className="hover:text-primary">Terms</a>
          <a href="https://github.com/jojo-swe/PulseWeave" className="hover:text-primary">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
