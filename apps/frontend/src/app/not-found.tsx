import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, Search, ArrowLeft } from 'lucide-react';

/**
 * Custom 404 Not Found page.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Animated 404 */}
        <div className="space-y-2">
          <h1 className="text-8xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent animate-pulse">
            404
          </h1>
          <h2 className="text-2xl font-bold">Page not found</h2>
          <p className="text-muted-foreground">
            Sorry, we couldn&apos;t find the page you&apos;re looking for. Perhaps it was moved or deleted.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="outline">
            <Link href="javascript:history.back()">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Link>
          </Button>
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go home
            </Link>
          </Button>
        </div>

        {/* Help text */}
        <p className="text-sm text-muted-foreground">
          Need help?{' '}
          <Link href="/support" className="text-primary hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
