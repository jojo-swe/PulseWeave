export function TechStack() {
  const stack = [
    { name: "Next.js", color: "hover:text-white" },
    { name: "Socket.io", color: "hover:text-white" },
    { name: "TypeScript", color: "hover:text-blue-400" },
    { name: "Prisma", color: "hover:text-white" },
    { name: "Tailwind", color: "hover:text-cyan-400" },
    { name: "Node.js", color: "hover:text-green-500" },
  ];

  return (
    <section id="tech-stack" className="py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
          Powered by modern technologies
        </p>
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-70">
          {stack.map((item) => (
            <span 
              key={item.name} 
              className={`text-2xl font-bold text-muted-foreground transition-colors duration-300 ${item.color} cursor-default`}
            >
              {item.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
