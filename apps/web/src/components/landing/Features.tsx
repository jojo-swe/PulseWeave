"use client";

import { motion } from "framer-motion";
import { MessageSquare, Shield, Lock, Zap, Users, Layout } from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Real-time Messaging",
    description: "Instant delivery with Socket.io. Chat in channels or direct messages without delay."
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Advanced rate limiting, IP blocking, and account lockout policies to keep data safe."
  },
  {
    icon: Lock,
    title: "RBAC & Permissions",
    description: "Granular role-based access control. Manage admins, moderators, and members easily."
  },
  {
    icon: Zap,
    title: "Multi-Factor Auth",
    description: "Secure accounts with TOTP apps, WebAuthn, YubiKeys, and Passkeys."
  },
  {
    icon: Users,
    title: "LDAP / SSO",
    description: "Seamless integration with existing directory services for unified identity management."
  },
  {
    icon: Layout,
    title: "Modern Interface",
    description: "Beautifully crafted dark theme with glassmorphism details and smooth animations."
  }
];

export function Features() {
  return (
    <section id="features" className="py-24 relative bg-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Everything you need</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Packed with powerful features to help your team communicate effectively and securely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="glass-card p-8 rounded-2xl group hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
