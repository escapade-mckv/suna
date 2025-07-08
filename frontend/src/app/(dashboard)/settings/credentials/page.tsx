'use client';

import React, { useEffect } from 'react';
import { 
  AlertTriangle, 
  Zap
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PipedreamConnectionsSection } from './_components/pipedream-connections-section';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from '@/lib/feature-flags';

export default function AppProfilesPage() {
  const { enabled: customAgentsEnabled, loading: flagLoading } = useFeatureFlag("custom_agents");
  const router = useRouter();
  
  useEffect(() => {
    if (!flagLoading && !customAgentsEnabled) {
      router.replace("/dashboard");
    }
  }, [flagLoading, customAgentsEnabled, router]);

  if (flagLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">App Profiles</h1>
                <p className="text-sm text-muted-foreground">Manage your connected app integrations</p>
              </div>
            </div>
          </div>
          
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!customAgentsEnabled) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">App Profiles</h1>
              <p className="text-sm text-muted-foreground">Manage your connected app integrations</p>
            </div>
          </div>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <Zap className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Connect your favorite apps to unlock powerful automation capabilities for your AI agents.
          </AlertDescription>
        </Alert>

        <PipedreamConnectionsSection />
      </div>
    </div>
  );
} 