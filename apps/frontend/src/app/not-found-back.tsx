'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

/**
 * Client-side back button for the 404 page.
 * Separated into its own component because not-found.tsx is a Server Component.
 */
export function BackButton() {
  const router = useRouter();

  return (
    <Button variant="outline" onClick={() => router.back()}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      Go back
    </Button>
  );
}
