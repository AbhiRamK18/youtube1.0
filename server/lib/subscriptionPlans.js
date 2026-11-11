const makePlan = ({
  id,
  name,
  monthlyRupees,
  dailyDownloads,
  monthlyDownloads,
  quality,
  premiumRank,
  exclusiveCourses,
  adFree,
  prioritySupport,
}) => ({
  id,
  name,
  currency: "INR",
  monthlyPricePaise: monthlyRupees * 100,
  dailyDownloads,
  monthlyDownloads,
  quality,
  premiumRank,
  exclusiveCourses,
  adFree,
  prioritySupport,
});

export const SUBSCRIPTION_PLANS = {
  free: makePlan({
    id: "free",
    name: "Free",
    monthlyRupees: 0,
    dailyDownloads: 1,
    monthlyDownloads: 30,
    quality: "480p",
    premiumRank: 0,
    exclusiveCourses: "none",
    adFree: false,
    prioritySupport: false,
  }),
  bronze: makePlan({
    id: "bronze",
    name: "Bronze",
    monthlyRupees: 99,
    dailyDownloads: 5,
    monthlyDownloads: 100,
    quality: "720p",
    premiumRank: 1,
    exclusiveCourses: "none",
    adFree: false,
    prioritySupport: false,
  }),
  silver: makePlan({
    id: "silver",
    name: "Silver",
    monthlyRupees: 199,
    dailyDownloads: 15,
    monthlyDownloads: 300,
    quality: "1080p",
    premiumRank: 2,
    exclusiveCourses: "selected",
    adFree: true,
    prioritySupport: false,
  }),
  gold: makePlan({
    id: "gold",
    name: "Gold",
    monthlyRupees: 399,
    dailyDownloads: 30,
    monthlyDownloads: 600,
    quality: "Highest available",
    premiumRank: 3,
    exclusiveCourses: "all",
    adFree: true,
    prioritySupport: true,
  }),
};

export const getPlanPricePaise = (planId, period) => {
  const plan = SUBSCRIPTION_PLANS[planId];
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[period];
  if (!plan || !months || planId === "free") return null;
  const discount = period === "quarterly" ? 0.9 : period === "yearly" ? 0.8 : 1;
  return Math.round(plan.monthlyPricePaise * months * discount);
};

export const getPlanCatalog = () =>
  Object.values(SUBSCRIPTION_PLANS).map((plan) => ({
    ...plan,
    prices: {
      monthly: plan.id === "free" ? 0 : getPlanPricePaise(plan.id, "monthly"),
      quarterly: plan.id === "free" ? 0 : getPlanPricePaise(plan.id, "quarterly"),
      yearly: plan.id === "free" ? 0 : getPlanPricePaise(plan.id, "yearly"),
    },
  }));

export const getActivePlan = async (userId) => {
  const now = new Date();
  await Subscription.updateMany(
    {
      userId,
      status: { $in: ["active", "scheduled", "cancelled"] },
      expiresAt: { $lte: now },
    },
    { $set: { status: "expired" } },
  );
  await Subscription.updateMany(
    {
      userId,
      status: "scheduled",
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
    },
    { $set: { status: "active" } },
  );
  const activeSubscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "cancelled"] },
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });
  const plan = SUBSCRIPTION_PLANS[activeSubscription?.plan || "free"];
  return {
    ...plan,
    subscription: activeSubscription,
  };
};
import Subscription from "../Modals/subscription.js";
