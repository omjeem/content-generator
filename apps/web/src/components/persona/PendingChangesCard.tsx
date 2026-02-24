"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { IPersonaPendingChanges } from "@repo/shared-types";

interface PendingChangesCardProps {
  changes: IPersonaPendingChanges;
  onApply: () => void;
  onDiscard: () => void;
  applying?: boolean;
}

const fieldLabels: Record<keyof IPersonaPendingChanges, string> = {
  goals: "Professional Goals",
  targetAudience: "Target Audience",
  industry: "Industry",
  contentPillars: "Content Pillars",
  postingFrequency: "Posting Frequency",
  topics: "Topics",
  tone: "Tone",
  writingStyle: "Writing Style",
  platformGoal: "Platform Goal",
};

export function PendingChangesCard({
  changes,
  onApply,
  onDiscard,
  applying,
}: PendingChangesCardProps) {
  const changedFields = Object.entries(changes).filter(
    ([, v]) => v !== undefined && v !== null,
  );

  if (changedFields.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <span>✏️</span>
              Proposed Changes
            </h3>
            <p className="text-xs text-amber-700 mt-0.5">
              The AI is suggesting updates to your profile. Review and apply or
              discard.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {changedFields.map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg bg-white border border-amber-100 px-3 py-2"
            >
              <p className="text-xs font-semibold text-gray-500 mb-0.5">
                {fieldLabels[key as keyof IPersonaPendingChanges] ?? key}
              </p>
              <p className="text-sm text-gray-800">
                {Array.isArray(value) ? value.join(", ") : String(value)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onApply}
            loading={applying}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
          >
            {applying ? "Applying…" : "✓ Apply Changes"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDiscard}
            disabled={applying}
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
