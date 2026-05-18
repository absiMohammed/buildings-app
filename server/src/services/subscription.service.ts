import type { Types } from 'mongoose';
import type { BuildingType } from '../models/Building.js';
import { getOrCreatePricing } from '../models/FeaturePricing.js';
import { BuildingAction } from '../models/BuildingAction.js';

export interface SubscriptionFeatureLine {
  kind: 'feature';
  moduleId: string;
  annual: number;
}

export interface SubscriptionActionLine {
  kind: 'action';
  actionId: string;
  type: string;
  name: string;
  annual: number;
}

export type SubscriptionLine = SubscriptionFeatureLine | SubscriptionActionLine;

export interface SubscriptionSummary {
  annual: number;
  monthly: number; // annual / 12, rounded to 2dp
  lines: SubscriptionLine[];
  currency: string;
  // Subtotals for the dashboard breakdown.
  featuresAnnual: number;
  actionsAnnual: number;
}

/**
 * Computes a building's subscription cost as the sum of two streams:
 *
 *   1. Feature-based: the building's enabled modules × per-feature annual
 *      price (FeaturePricing doc). When `enabledModules` is null every
 *      priced feature counts; otherwise it's intersected.
 *
 *   2. Action-based: each active BuildingAction for the building carries
 *      its own annual price (admin sets it per action when they wire up
 *      the integration). Inactive actions are excluded.
 *
 * Missing prices default to 0 (a feature or action is "free" until priced).
 */
export async function computeBuildingSubscription(
  building: (Pick<BuildingType, 'enabledModules'> & { _id?: Types.ObjectId | string }) | null | undefined
): Promise<SubscriptionSummary> {
  const pricing = await getOrCreatePricing();
  const priceMap = (pricing.prices as Record<string, number> | null | undefined) ?? {};
  const enabled = building?.enabledModules;
  const allModules = Object.keys(priceMap);
  const moduleIds: string[] = Array.isArray(enabled) ? enabled : allModules;

  const featureLines: SubscriptionFeatureLine[] = [];
  for (const id of moduleIds) {
    const raw = priceMap[id];
    if (typeof raw === 'number' && raw > 0) {
      featureLines.push({ kind: 'feature', moduleId: id, annual: raw });
    }
  }

  let actionLines: SubscriptionActionLine[] = [];
  if (building?._id) {
    const actions = await BuildingAction.find({
      buildingId: building._id,
      status: 'active',
    }).lean();
    actionLines = actions
      .filter((a) => typeof a.annualPrice === 'number' && a.annualPrice > 0)
      .map((a) => ({
        kind: 'action' as const,
        actionId: String(a._id),
        type: a.type as string,
        name: a.name as string,
        annual: a.annualPrice as number,
      }));
  }

  const featuresAnnual = featureLines.reduce((s, l) => s + l.annual, 0);
  const actionsAnnual = actionLines.reduce((s, l) => s + l.annual, 0);
  const annual = featuresAnnual + actionsAnnual;
  const monthly = Math.round((annual / 12) * 100) / 100;
  return {
    annual: Math.round(annual * 100) / 100,
    monthly,
    lines: [...featureLines, ...actionLines],
    currency: pricing.currency ?? 'USD',
    featuresAnnual: Math.round(featuresAnnual * 100) / 100,
    actionsAnnual: Math.round(actionsAnnual * 100) / 100,
  };
}
