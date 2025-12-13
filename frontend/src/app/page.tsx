import Link from 'next/link';
import { MessageSquare, Users, Zap, BarChart3 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">ChatBaby</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Unified Inbox for
            <span className="text-primary"> Multi-Channel</span> Sales
          </h1>
          <p className="text-xl text-muted-foreground mb-10">
            Manage WhatsApp, TikTok, Instagram and more from a single dashboard.
            Automate responses, assign agents, and grow your business.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="#features"
              className="border border-input px-8 py-3 rounded-lg text-lg font-medium hover:bg-accent transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Features */}
        <div id="features" className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-32">
          <div className="bg-card p-6 rounded-xl border">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Multi-Channel Inbox</h3>
            <p className="text-muted-foreground">
              WhatsApp, TikTok DM, Instagram DM - all in one unified inbox.
            </p>
          </div>

          <div className="bg-card p-6 rounded-xl border">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Team Collaboration</h3>
            <p className="text-muted-foreground">
              Assign conversations, manage roles, and track team performance.
            </p>
          </div>

          <div className="bg-card p-6 rounded-xl border">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Automation</h3>
            <p className="text-muted-foreground">
              Chatbots, quick replies, and automated workflows to save time.
            </p>
          </div>

          <div className="bg-card p-6 rounded-xl border">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Analytics</h3>
            <p className="text-muted-foreground">
              Track conversations, response times, and team productivity.
            </p>
          </div>
        </div>

        {/* Channels */}
        <div className="mt-32 text-center">
          <h2 className="text-3xl font-bold mb-4">Connect Your Channels</h2>
          <p className="text-muted-foreground mb-8">
            Support for all major messaging platforms
          </p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 px-6 py-3 bg-card rounded-lg border">
              <div className="w-8 h-8 rounded-full bg-whatsapp flex items-center justify-center">
                <span className="text-white font-bold text-sm">W</span>
              </div>
              <span className="font-medium">WhatsApp</span>
            </div>
            <div className="flex items-center gap-2 px-6 py-3 bg-card rounded-lg border opacity-60">
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="font-medium">TikTok</span>
              <span className="text-xs text-muted-foreground">Coming Soon</span>
            </div>
            <div className="flex items-center gap-2 px-6 py-3 bg-card rounded-lg border opacity-60">
              <div className="w-8 h-8 rounded-full bg-instagram flex items-center justify-center">
                <span className="text-white font-bold text-sm">I</span>
              </div>
              <span className="font-medium">Instagram</span>
              <span className="text-xs text-muted-foreground">Coming Soon</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-20 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">ChatBaby</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built for sales teams that want to scale.
          </p>
        </div>
      </footer>
    </div>
  );
}
