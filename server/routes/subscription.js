import express from "express";
import {
  cancelSubscriptionOrder,
  cancelSubscriptionRenewal,
  createSubscriptionOrder,
  getSubscriptionDashboard,
  getSubscriptionPlans,
  reconcileSubscriptionOrder,
  verifySubscriptionPayment,
} from "../controllers/subscription.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.get("/plans", getSubscriptionPlans);
routes.get("/dashboard", requireFirebaseUser, getSubscriptionDashboard);
routes.post("/orders", requireFirebaseUser, createSubscriptionOrder);
routes.post("/verify", requireFirebaseUser, verifySubscriptionPayment);
routes.post(
  "/orders/:orderId/reconcile",
  requireFirebaseUser,
  reconcileSubscriptionOrder,
);
routes.post(
  "/orders/:orderId/cancel",
  requireFirebaseUser,
  cancelSubscriptionOrder,
);
routes.post(
  "/:subscriptionId/cancel",
  requireFirebaseUser,
  cancelSubscriptionRenewal,
);

export default routes;
