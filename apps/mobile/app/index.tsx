import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useStore } from '@/store';

/**
 * Entry point - redirects to login or main app based on auth state.
 */
export default function Index() {
  const { token, hydrated } = useStore();

  // Wait for store to hydrate from storage
  if (!hydrated) {
    return null;
  }

  // Redirect based on auth state
  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
