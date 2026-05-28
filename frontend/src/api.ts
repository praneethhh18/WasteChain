const BASE = "/api";

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return r.status === 204 ? (undefined as any) : await r.json();
}

export const api = {
  users: (role?: string) => call<User[]>(`/auth/users${role ? `?role=${role}` : ""}`),
  login: (phone: string) => call<{ token: string; user: User }>("/auth/login", {
    method: "POST", body: JSON.stringify({ phone }),
  }),

  batches: (params: { creator_phone?: string; status?: string; material?: string } = {}) => {
    const q = new URLSearchParams(params as any).toString();
    return call<Batch[]>(`/batches${q ? `?${q}` : ""}`);
  },
  createBatch: (b: BatchCreate) => call<Batch>("/batches", { method: "POST", body: JSON.stringify(b) }),
  batchMatches: (id: number) => call<Match[]>(`/batches/${id}/matches`),
  acceptMatch: (batchId: number, bidId: number) =>
    call(`/batches/${batchId}/accept-match?bid_id=${bidId}`, { method: "POST" }),

  handoffs: (params: { user_phone?: string; discrepancy_only?: boolean } = {}) => {
    const q = new URLSearchParams(params as any).toString();
    return call<Handoff[]>(`/handoffs${q ? `?${q}` : ""}`);
  },
  initiateHandoff: (b: HandoffInitiate) =>
    call<Handoff>("/handoffs/initiate", { method: "POST", body: JSON.stringify(b) }),
  confirmHandoff: (b: HandoffConfirm) =>
    call<Handoff>("/handoffs/confirm", { method: "POST", body: JSON.stringify(b) }),

  bids: (recycler_phone?: string) => call<Bid[]>(`/bids${recycler_phone ? `?recycler_phone=${recycler_phone}` : ""}`),
  createBid: (b: BidCreate) => call<Bid>("/bids", { method: "POST", body: JSON.stringify(b) }),
  cancelBid: (id: number) => call(`/bids/${id}`, { method: "DELETE" }),

  smsInbound: (phone: string, body: string) =>
    call("/sms/inbound", { method: "POST", body: JSON.stringify({ phone, body }) }),
  smsHistory: (phone: string) => call<SmsMessage[]>(`/sms/history?phone=${encodeURIComponent(phone)}`),
  smsReset: (phone: string) => call(`/sms/reset?phone=${encodeURIComponent(phone)}`, { method: "POST" }),

  trustChain: () => call<TrustRecord[]>("/trust/chain"),
  tamper: (batch_id: number, new_weight_kg: number) =>
    call("/trust/tamper", { method: "POST", body: JSON.stringify({ batch_id, new_weight_kg }) }),
  restoreChain: () => call("/trust/restore", { method: "POST" }),

  municipalityStats: () => call<MunicipalityStats>("/municipality/stats"),

  // Upstream — collection routes, pickups, ragpicker recoveries, provenance
  routes: (params: { collector_phone?: string; status?: string } = {}) => {
    const q = new URLSearchParams(params as any).toString();
    return call<Route[]>(`/collections/routes${q ? `?${q}` : ""}`);
  },
  routeDetail: (id: number) => call<RouteDetail>(`/collections/route/${id}`),
  startRoute: (b: RouteStart) => call<Route>("/collections/route/start", {
    method: "POST", body: JSON.stringify(b),
  }),
  logPickup: (b: PickupCreate) => call<Pickup>("/collections/route/pickup", {
    method: "POST", body: JSON.stringify(b),
  }),
  endRoute: (b: RouteEnd) => call<Route>("/collections/route/end", {
    method: "POST", body: JSON.stringify(b),
  }),
  aggregationPoints: () => call<AggregationPoint[]>("/aggregation-points"),

  recoveries: (params: { ragpicker_phone?: string; unsold_only?: boolean } = {}) => {
    const q = new URLSearchParams(params as any).toString();
    return call<Recovery[]>(`/recoveries${q ? `?${q}` : ""}`);
  },
  createRecovery: (b: RecoveryCreate) => call<Recovery>("/recoveries", {
    method: "POST", body: JSON.stringify(b),
  }),
  sellRecovery: (b: RecoverySell) => call<Batch>("/recoveries/sell", {
    method: "POST", body: JSON.stringify(b),
  }),

  provenance: (batchId: number) => call<Provenance>(`/provenance/batch/${batchId}`),

  carbon: (window: "day" | "week" | "month" | "all" = "month") =>
    call<CarbonSummary>(`/municipality/carbon?window=${window}`),

  // GPS streaming for active routes
  pingRoute: (routeId: number, lat: number, lon: number, accuracy?: number, speed?: number) =>
    call(`/collections/route/${routeId}/ping`, {
      method: "POST",
      body: JSON.stringify({ route_id: routeId, lat, lon, accuracy_m: accuracy, speed_kmh: speed }),
    }),
  routePath: (routeId: number) => call<RoutePath>(`/collections/route/${routeId}/path`),

  // Live network map + search
  live: (q?: string) => call<LiveNetwork>(`/live${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  search: (q: string) => call<SearchResults>(`/search?q=${encodeURIComponent(q)}`),

  organizations: () => call<Organization[]>("/organizations"),
  createOrganization: (b: OrganizationCreate) => call<Organization>("/organizations", {
    method: "POST", body: JSON.stringify(b),
  }),
  orgMembers: (id: number) => call<{ id: number; name: string; role: string; phone: string; area?: string }[]>(`/organizations/${id}/users`),
  addOrgMember: (id: number, m: { name: string; role: string; phone: string; area?: string; language?: string }) =>
    call(`/organizations/${id}/members`, { method: "POST", body: JSON.stringify(m) }),
  orgTree: (id: number) => call<OrgTreeNode>(`/organizations/${id}/tree`),
  createDivision: (id: number, d: { name: string; type: string; admin_name?: string; admin_phone?: string }) =>
    call<Organization>(`/organizations/${id}/divisions`, { method: "POST", body: JSON.stringify(d) }),

  anomalies: () => call<AnomalyScan>("/anomalies"),
  flows: (windowDays: number = 30) => call<FlowGraph>(`/flows?window_days=${windowDays}`),

  inspect: async (material: string, photoBlob: Blob): Promise<InspectResult> => {
    const fd = new FormData();
    fd.append("material", material);
    fd.append("photo", photoBlob, "sack.jpg");
    const r = await fetch("/api/inspect", { method: "POST", body: fd });
    if (!r.ok) throw new Error("inspect failed");
    return r.json();
  },
};

// ---- types ----
export type User = {
  id: number; phone: string; name: string; role: string;
  lat?: number; lon?: number; area?: string; language: string;
  reputation_score: number; usual_price_inr: Record<string, number>;
  organization_id?: number | null;
};

export type Batch = {
  id: number; batch_code: string; creator_id: number; current_holder_id?: number;
  material_type: string; weight_kg: number; lat: number; lon: number;
  area?: string; status: string; source_channel: string; notes?: string;
  record_hash: string; previous_hash: string; tampered: boolean;
  created_at: string;
  source_recovery_id?: number;
};
export type BatchCreate = {
  creator_phone: string; material_type: string; weight_kg: number;
  lat: number; lon: number; area?: string;
  source_channel?: string; captured_at?: string; notes?: string;
};

export type Match = {
  bid_id: number; recycler_id: number; recycler_name: string;
  recycler_area?: string; material_type: string; price_per_kg: number;
  distance_km: number; score: number;
  expected_earnings_inr: number; usual_earnings_inr: number;
  earnings_delta_inr: number; reputation_score: number;
};

export type Handoff = {
  id: number; batch_id: number; sender_id: number; receiver_id: number;
  sent_weight: number; received_weight?: number;
  price_per_kg?: number; status: string;
  discrepancy_pct?: number; discrepancy_flag: boolean;
  initiated_at: string; confirmed_at?: string;
  record_hash: string; previous_hash: string;
  photo_data_url?: string | null;
  photo_hash?: string | null;
};
export type HandoffInitiate = { batch_id: number; sender_phone: string; receiver_phone: string; sent_weight: number; price_per_kg?: number };
export type HandoffConfirm = { handoff_id: number; receiver_phone: string; received_weight: number; photo_data_url?: string };

export type RoutePath = {
  route_id: number; route_code: string; status: string;
  coords: { lat: number; lon: number; kind: "start" | "ping" | "end"; at?: string; speed?: number }[];
  current?: { lat: number; lon: number };
};

export type LiveNetwork = {
  now: string;
  filter?: string;
  active_routes: {
    id: number; code: string; status: string;
    ward?: string; started_at: string; ended_at?: string;
    pickup_count: number; total_weight_kg?: number;
    collector?: { id: number; name: string; phone: string; area?: string };
    current_lat?: number; current_lon?: number;
    coords: { lat: number; lon: number; kind: string }[];
    ping_count: number;
  }[];
  recent_batches: {
    id: number; code: string; material: string; weight_kg: number;
    lat: number; lon: number; area?: string; status: string;
    created_at: string;
    creator?: { id: number; name: string; phone: string };
    tampered: boolean;
  }[];
  recent_handoffs: {
    id: number; status: string;
    from: { name: string; role: string; lat: number; lon: number };
    to:   { name: string; role: string; lat: number; lon: number };
    sent_weight: number; received_weight?: number;
    discrepancy_flag: boolean; has_photo: boolean;
    initiated_at: string;
  }[];
  aggregation_points: { id: number; name: string; lat: number; lon: number; area?: string }[];
  counts: {
    active_route_count: number; recent_route_count: number;
    recent_batch_count: number; recent_handoff_count: number;
  };
};

export type SearchResults = {
  q: string;
  users: { id: number; name: string; role: string; phone: string; area?: string; lat?: number; lon?: number }[];
  batches: { id: number; code: string; material: string; weight_kg: number; area?: string; lat: number; lon: number; status: string; created_at: string }[];
  routes: { id: number; code: string; ward?: string; status: string; pickup_count: number; started_at: string }[];
};

export type AnomalyFinding = {
  kind: "REBAG_SUSPICION" | "WEIGHT_SHAVING" | "TEMPORAL_INCONSISTENCY" | "DENSITY_VIOLATION" | "REPUTATION_FARMING";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence_ids: number[];
  actors: string[];
  suggested_action: string;
  detected_at: string;
};
export type AnomalyScan = {
  scanned_at: string;
  total: number;
  by_kind: Record<string, number>;
  by_severity: Record<string, number>;
  findings: AnomalyFinding[];
};
export type FlowGraph = {
  window_days: number;
  scanned_at: string;
  node_count: number;
  link_count: number;
  total_kg: number;
  nodes: { id: number; name: string; role: string; area?: string; lat?: number; lon?: number }[];
  links: { from_id: number; to_id: number; total_kg: number; handoff_count: number; by_material: Record<string, number> }[];
};

export type Organization = {
  id: number; name: string; type: string;
  parent_id?: number | null;
  country: string; state?: string; district?: string; city_or_village?: string;
  admin_name?: string; admin_phone?: string;
  is_demo: boolean; member_count: number; division_count?: number;
  created_at: string;
};
export type OrgTreeNode = {
  id: number; name: string; type: string; member_count: number;
  children: OrgTreeNode[];
};
export type OrganizationCreate = {
  name: string; type: string;
  country: string; state?: string; district?: string; city_or_village?: string;
  admin_name: string; admin_phone: string;
};

export type Bid = {
  id: number; recycler_id: number; material_type: string;
  quantity_needed_kg: number; price_per_kg: number; valid_until: string;
  lat: number; lon: number; active: boolean;
};
export type BidCreate = {
  recycler_phone: string; material_type: string;
  quantity_needed_kg: number; price_per_kg: number;
  valid_hours?: number; lat?: number; lon?: number;
};

export type SmsMessage = { id: number; phone: string; direction: "IN" | "OUT"; body: string; created_at: string };

export type TrustRecord = {
  kind: "batch" | "handoff" | "route" | "pickup" | "recovery";
  id: number; code?: string;
  batch_id?: number; material?: string; weight_kg?: number;
  sent_weight?: number; received_weight?: number;
  stored_hash: string; expected_hash: string;
  previous_hash: string; expected_previous_hash: string;
  tampered: boolean; ok: boolean; created_at: string;
};

export type CarbonSummary = {
  total_weight_kg: number;
  total_co2e_saved_kg: number;
  total_epr_credit_inr: number;
  equivalents: { tree_years: number; petrol_km_avoided: number };
  by_material: Record<string, { weight_kg: number; co2e_saved_kg: number; epr_credit_inr: number }>;
};

export type InspectResult = {
  mode: "demo" | "live";
  material_declared: string;
  breakdown: {
    primary: { label: string; pct: number };
    secondary: { label: string; pct: number };
    contamination: { label: string; pct: number };
  };
  quality_grade: "A" | "B" | "C";
  contamination_pct: number;
  price_adjustment_pct: number;
  confidence: number;
  advisory: string;
  production_note: string;
};

export type MunicipalityStats = {
  total_recovered_kg_today: number; total_recovered_kg_week: number;
  total_recovered_kg_month: number; active_collectors: number;
  landfill_diversion_pct: number;
  material_breakdown: Record<string, number>;
  daily_series: { date: string; kg: number }[];
  flagged_handoffs: number;
  collected_kg_today: number;
  collected_kg_week: number;
  active_routes: number;
  carbon?: CarbonSummary;
};

// Upstream types
export type Route = {
  id: number; route_code: string; collector_id: number;
  started_at: string; ended_at?: string;
  start_lat?: number; start_lon?: number;
  end_lat?: number; end_lon?: number;
  dump_aggregation_point_id?: number;
  total_estimated_weight_kg?: number;
  pickup_count: number; status: string;
  ward?: string;
  record_hash: string; previous_hash: string;
};
export type RouteStart = { collector_phone: string; lat: number; lon: number; ward?: string };
export type RouteEnd = {
  route_id: number; lat: number; lon: number;
  total_estimated_weight_kg: number; dump_aggregation_point_id?: number;
};
export type Pickup = {
  id: number; route_id: number; lat: number; lon: number;
  captured_at: string; estimated_weight_kg?: number;
  house_tag?: string; photo_url?: string;
  record_hash: string; previous_hash: string;
};
export type PickupCreate = {
  route_id: number; lat: number; lon: number;
  estimated_weight_kg?: number; house_tag?: string; photo_url?: string;
};
export type AggregationPoint = {
  id: number; name: string; lat: number; lon: number;
  area?: string; capacity_tonnes: number;
};
export type RouteDetail = {
  route: Route; pickups: Pickup[];
  collector?: { id: number; name: string; phone: string };
  dump_point?: { id: number; name: string; lat: number; lon: number };
};
export type Recovery = {
  id: number; recovery_code: string; ragpicker_id: number;
  aggregation_point_id?: number; door_to_door: boolean;
  material_type: string; weight_kg: number;
  lat: number; lon: number; captured_at: string;
  sold_to_kabadiwala_id?: number; sold_at?: string;
  sold_price_inr?: number; batch_id?: number;
  record_hash: string; previous_hash: string;
};
export type RecoveryCreate = {
  ragpicker_phone: string; material_type: string; weight_kg: number;
  lat: number; lon: number; aggregation_point_id?: number;
  door_to_door?: boolean; captured_at?: string;
};
export type RecoverySell = { recovery_id: number; kabadiwala_phone: string; price_inr: number };

export type Provenance = {
  batch: {
    id: number; code: string; material: string; weight_kg: number;
    created_at: string; hash: string;
    creator?: { id: number; name: string; area?: string };
  };
  recovery?: {
    id: number; code: string; material: string; weight_kg: number;
    door_to_door: boolean; captured_at: string;
    lat: number; lon: number; hash: string;
    ragpicker?: { id: number; name: string; area?: string };
  };
  aggregation_point?: {
    id: number; name: string; area?: string; lat: number; lon: number;
  };
  routes: {
    id: number; code: string; started_at: string; ended_at?: string;
    pickup_count: number; weight_kg?: number; ward?: string; hash: string;
    collector?: { id: number; name: string };
  }[];
  pickups: {
    id: number; route_id: number; lat: number; lon: number;
    captured_at: string; house_tag?: string;
    estimated_weight_kg?: number; hash: string;
  }[];
  handoffs: {
    id: number; status: string;
    sent_weight: number; received_weight?: number;
    discrepancy_pct?: number; discrepancy_flag?: boolean;
    sender?: { id: number; name: string; role: string };
    receiver?: { id: number; name: string; role: string };
    hash: string; initiated_at: string;
  }[];
};
