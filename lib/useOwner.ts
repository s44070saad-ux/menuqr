"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Profile, Restaurant, Subscription } from "./types";

export interface OwnerState {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  restaurant: Restaurant | null;
  subscription: Subscription | null; // includes joined plan
  error: string | null;
  refresh: () => void;
}

/**
 * Loads the signed-in user, their profile, their first restaurant and
 * that restaurant's subscription (+ plan). Used by every dashboard page.
 * Assumes DashboardShell's auth guard already ran (user is signed in).
 */
export function useOwner(): OwnerState {
  const [state, setState] = useState<Omit<OwnerState, "refresh">>({
    loading: true, userId: null, profile: null, restaurant: null, subscription: null, error: null,
  });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!supabase) { setState((s) => ({ ...s, loading: false })); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!u.user) { setState({ loading: false, userId: null, profile: null, restaurant: null, subscription: null, error: null }); return; }
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
        const { data: restaurants } = await supabase
          .from("restaurants").select("*").eq("owner_id", u.user.id)
          .order("created_at", { ascending: true }).limit(1);
        const restaurant = (restaurants?.[0] as Restaurant) ?? null;
        let subscription: Subscription | null = null;
        if (restaurant) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("*, plan:subscription_plans(*)")
            .eq("restaurant_id", restaurant.id)
            .single();
          subscription = (sub as Subscription) ?? null;
        }
        if (!cancelled) {
          setState({ loading: false, userId: u.user.id, profile: (profile as Profile) ?? null, restaurant, subscription, error: null });
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Failed to load your data." }));
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { ...state, refresh };
}
