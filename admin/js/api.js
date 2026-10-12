/* ═══════════════════════════════════════════════════════════
   Couche données — seul point de contact avec Supabase.
   Aucune vue ne parle directement à la base : toute requête
   passe par ici, ce qui garde un seul endroit à faire évoluer.
   ═══════════════════════════════════════════════════════════ */
(function (w) {
  const cfg = w.FLY_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  const client = (configured && w.supabase)
    ? w.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  // Tant que Supabase n'est pas branché, l'admin affiche ses
  // écrans vides au lieu de planter : le squelette reste lisible.
  const NOT_READY = { data: [], count: 0, notConfigured: true };

  async function select(from, { columns = '*', filters = [], order, limit = 100, search } = {}) {
    if (!client) return NOT_READY;
    let q = client.from(from).select(columns, { count: 'exact' });
    filters.forEach(([col, op, val]) => { q = q[op](col, val); });
    if (search && search.columns && search.value) {
      q = q.or(search.columns.map(c => `${c}.ilike.%${search.value}%`).join(','));
    }
    if (order) q = q.order(order.column, { ascending: !!order.ascending, nullsFirst: false });
    if (limit) q = q.limit(limit);
    const { data, error, count } = await q;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  }

  async function selectOne(from, id, columns = '*') {
    if (!client) return null;
    const { data, error } = await client.from(from).select(columns).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  // Toute écriture passe par une fonction RPC Postgres (SECURITY DEFINER +
  // is_admin() à l'intérieur) : jamais d'update direct depuis le navigateur.
  async function rpc(fn, args = {}) {
    if (!client) throw new Error('Supabase non connecté');
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message || 'Erreur serveur');
    return data;
  }

  const api = {
    configured,
    client,

    /* ── Session ── */
    async currentUser() {
      if (!client) return null;
      const { data } = await client.auth.getUser();
      return data?.user || null;
    },
    async profile() {
      if (!client) return null;
      const user = await api.currentUser();
      if (!user) return null;
      const { data } = await client.from('profiles').select('*').eq('id', user.id).single();
      return data || null;
    },
    signIn: (email, password) => client.auth.signInWithPassword({ email, password }),
    signOut: () => client && client.auth.signOut(),

    /* ── Tableau de bord ── */
    async dashboard() {
      if (!client) return null;
      const { data, error } = await client.from('dashboard_stats').select('*').single();
      if (error) throw error;
      return data;
    },

    /* ── Rubriques (lecture seule en Phase A) ── */
    events: (state, search) => select('events_overview', {
      filters: state && state !== 'all' ? [['effective_state', 'eq', state]] : [],
      search: { columns: ['title'], value: search },
      order: { column: 'start_at', ascending: false }
    }),
    contacts: (search, tag) => select('contacts_overview', {
      filters: tag && tag !== 'all' ? [['tags', 'cs', `{${tag}}`]] : [],
      search: { columns: ['first_name', 'last_name', 'email'], value: search },
      order: { column: 'last_activity_at', ascending: false }
    }),
    bookings: (status, search) => select('bookings_overview', {
      filters: status && status !== 'all' ? [['status', 'eq', status]] : [],
      search: { columns: ['service_name', 'customer_name'], value: search },
      order: { column: 'starts_at', ascending: false }
    }),
    orders: (status, search) => select('orders_overview', {
      filters: status && status !== 'all' ? [['status', 'eq', status]] : [],
      search: { columns: ['order_number', 'customer_name'], value: search },
      order: { column: 'created_at', ascending: false }
    }),
    payments: (status) => select('payments', {
      filters: status && status !== 'all' ? [['status', 'eq', status]] : [],
      order: { column: 'created_at', ascending: false }
    }),
    subscriptions: (status) => select('subscriptions', {
      filters: status && status !== 'all' ? [['status', 'eq', status]] : [],
      order: { column: 'created_at', ascending: false }
    }),
    catalog: (kind) => select('catalog_view', {
      filters: kind && kind !== 'all' ? [['kind', 'eq', kind]] : [],
      order: { column: 'created_at', ascending: false }
    }),
    videos: (search) => select('videos', {
      filters: [['deleted_at', 'is', null]],
      search: { columns: ['title'], value: search },
      order: { column: 'position', ascending: true }
    }),
    galleries: () => select('galleries', {
      filters: [['deleted_at', 'is', null]],
      order: { column: 'position', ascending: true }
    }),
    groups: () => select('groups', {
      filters: [['deleted_at', 'is', null]],
      order: { column: 'created_at', ascending: false }
    }),
    cmsCollections: () => select('cms_collections', { order: { column: 'position', ascending: true } }),
    cmsEntries: (collection) => select('cms_entries', {
      filters: [['deleted_at', 'is', null]].concat(collection && collection !== 'all' ? [['collection', 'eq', collection]] : []),
      order: { column: 'updated_at', ascending: false }
    }),

    /* ── CRM : Clients & prospects (Phase B) ─────────────────── */
    contact:          (id) => selectOne('contacts_overview', id),
    contactTimeline:  (id) => select('contact_timeline', {
      filters: [['contact_id', 'eq', id]],
      order: { column: 'happened_at', ascending: false }
    }),
    allTags:  () => select('tags', { order: { column: 'label', ascending: true }, limit: 200 }),
    duplicatesOf: async (id) => {
      if (!client) return [];
      const { data, error } = await client.rpc('admin_find_duplicate_contacts', { p_contact_id: id });
      if (error) throw new Error(error.message);
      return data || [];
    },

    saveContact: (c) => rpc('admin_upsert_contact', {
      p_id: c.id || null,
      p_first_name: c.first_name || null,
      p_last_name: c.last_name || null,
      p_email: c.email || null,
      p_phone: c.phone || null,
      p_address_line: c.address_line || null,
      p_postal_code: c.postal_code || null,
      p_city: c.city || null,
      p_country: c.country || 'France',
      p_notes: c.notes || null,
      p_marketing_optin: !!c.marketing_optin,
      p_source: c.source || null
    }),
    deleteContact:    (id) => rpc('admin_delete_contact', { p_id: id }),
    setContactTags:   (id, tags) => rpc('admin_set_contact_tags', { p_contact_id: id, p_tags: tags }),
    mergeContacts:    (keepId, mergeId) => rpc('admin_merge_contacts', { p_keep_id: keepId, p_merge_id: mergeId })
  };

  w.API = api;
})(window);
