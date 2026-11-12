import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { recalculateBalances } from './ledger';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://zbqbqbaotbbrwzdhflqt.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_aQUfo_hF6FbVN-y4eZun3w_R0f54_5u';

export const TUSHAR_USER_ID = '3f839a2e-d547-4b02-bdc0-a03875dcc308';
export const TUSHAR_USER_NAME = 'TUSHAR';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export type SyncAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
  color?: string;
};

export type SyncTransaction = {
  id: string;
  type: string;
  amount: number;
  category: string;
  from: string;
  to: string;
  date: string;
  note: string;
  payment?: string;
  time?: string;
};

export type SyncGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;
};

export type SyncData = {
  accounts: SyncAccount[];
  tx: SyncTransaction[];
  budget: number;
  currency?: string;
  theme?: string;
  dateFormat?: string;
  categories?: string[];
  budgets?: Record<string, number>;
  goals?: SyncGoal[];
};

const DEFAULT_CAT_IDS: Record<string, string> = {
  Food: 'cat_food',
  Shopping: 'cat_shopping',
  Transport: 'cat_transport',
  Bills: 'cat_bills',
  Housing: 'cat_housing',
  Healthcare: 'cat_healthcare',
  Health: 'cat_health',
  Education: 'cat_education',
  Study: 'cat_study',
  Entertainment: 'cat_entertainment',
  Fun: 'cat_fun',
  Travel: 'cat_travel',
  Subscriptions: 'cat_subscriptions',
  'Personal Care': 'cat_personal_care',
  Other: 'cat_other'
};

const toMinor = (amount: number) => Math.round((Number(amount) || 0) * 100);
const fromMinor = (minor: number) => Math.round(Number(minor) || 0) / 100;

function toCategorySlug(userId: string, catName: string): string {
  if (DEFAULT_CAT_IDS[catName]) return DEFAULT_CAT_IDS[catName];
  const slug = catName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `cat_${userId.slice(0, 8)}_${slug || 'custom'}`;
}

export async function saveLiveSupabaseData(
  userId: string,
  data: SyncData,
  opening: Record<string, number>
): Promise<{ ok: boolean; error?: string; updatedAt?: string }> {
  try {
    const nowIso = new Date().toISOString();

    // 1. Save live state in public.user_app_state
    const { error: stateErr } = await supabase.from('user_app_state').upsert(
      {
        user_id: userId,
        data,
        opening,
        updated_at: nowIso
      },
      { onConflict: 'user_id' }
    );
    if (stateErr) throw stateErr;

    // 2. Write custom categories into public.categories
    const allReferencedCategories = new Set<string>([
      ...(data.categories || []),
      ...data.tx.filter(t => t.type === 'Expense' && t.category).map(t => t.category),
      ...Object.keys(data.budgets || {})
    ]);
    const customCats = Array.from(allReferencedCategories).filter(
      c => c && !DEFAULT_CAT_IDS[c] && c !== 'Transfer' && c !== 'Repayment'
    );
    if (customCats.length > 0) {
      const catRows = customCats.map(name => ({
        id: toCategorySlug(userId, name),
        user_id: userId,
        name,
        color: '#6366f1',
        icon: 'Receipt',
        archived: false,
        updated_at: nowIso
      }));
      const { error: catErr } = await supabase
        .from('categories')
        .upsert(catRows, { onConflict: 'id' });
      if (catErr) throw catErr;
    }

    // 3. Write accounts into public.accounts
    const accountIds = new Set(data.accounts.map(a => a.id));
    if (data.accounts.length > 0) {
      const accRows = data.accounts.map(a => {
        const isCash =
          a.type.toLowerCase().includes('cash') || a.name.toLowerCase().includes('cash');
        const openBal = opening[a.id] ?? a.balance;
        return {
          id: a.id,
          user_id: userId,
          name: a.name,
          type: isCash ? 'cash' : 'bank',
          opening_balance_minor: toMinor(openBal),
          color: a.color || '#647be8',
          archived: false,
          updated_at: nowIso,
          deleted_at: null
        };
      });
      const { error: accErr } = await supabase
        .from('accounts')
        .upsert(accRows, { onConflict: 'id' });
      if (accErr) throw accErr;
    }

    // 4. Write Expenses & Bank <-> Cash Transfers into public.transactions
    const txExpensesAndTransfers = data.tx.filter(
      t =>
        (t.type === 'Expense' || t.type === 'Transfer') &&
        t.amount > 0 &&
        (!t.from || accountIds.has(t.from)) &&
        (!t.to || accountIds.has(t.to))
    );

    if (txExpensesAndTransfers.length > 0) {
      const txRows = txExpensesAndTransfers.map(t => {
        const isTransfer = t.type === 'Transfer';
        const occurredAt = `${t.date}T${t.time && /^\d{2}:\d{2}$/.test(t.time) ? t.time : '12:00'}:00+05:30`;
        const paymentMethod = isTransfer
          ? 'bank_transfer'
          : t.payment === 'Cash'
            ? 'cash'
            : 'upi';
        const catId = isTransfer ? null : toCategorySlug(userId, t.category || 'Other');

        return {
          id: t.id,
          user_id: userId,
          type: isTransfer ? 'transfer' : 'expense',
          title: t.note || t.category || t.type,
          amount_minor: Math.max(1, toMinor(t.amount)),
          account_id: isTransfer ? null : t.from || null,
          from_account_id: isTransfer ? t.from || null : null,
          to_account_id: isTransfer ? t.to || null : null,
          category_id: catId,
          payment_method: paymentMethod,
          occurred_at: occurredAt,
          note: t.note || '',
          is_atm_withdrawal: isTransfer,
          updated_at: nowIso,
          deleted_at: null
        };
      });
      const { error: txErr } = await supabase
        .from('transactions')
        .upsert(txRows, { onConflict: 'id' });
      if (txErr) throw txErr;
    }

    // 5. Write Repayments to Father into public.balance_adjustments
    const repayments = data.tx.filter(
      t => t.type === 'Repayment' && t.amount > 0 && accountIds.has(t.from)
    );
    if (repayments.length > 0) {
      const adjRows = repayments.map(t => {
        const occurredAt = `${t.date}T${t.time && /^\d{2}:\d{2}$/.test(t.time) ? t.time : '12:00'}:00+05:30`;
        return {
          id: t.id,
          user_id: userId,
          account_id: t.from,
          delta_minor: -Math.max(1, toMinor(t.amount)),
          kind: 'family_repayment',
          occurred_at: occurredAt,
          note: t.note || 'Repayment to Father',
          updated_at: nowIso,
          deleted_at: null
        };
      });
      const { error: adjErr } = await supabase
        .from('balance_adjustments')
        .upsert(adjRows, { onConflict: 'id' });
      if (adjErr) throw adjErr;
    }

    // 6. Write Monthly & Category Budgets into public.budgets
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const budgetRows: any[] = [];
    if (Number(data.budget) > 0) {
      budgetRows.push({
        id: `bgt_${userId.slice(0, 8)}_total`,
        user_id: userId,
        category_id: null,
        month: currentMonth,
        limit_minor: toMinor(data.budget),
        updated_at: nowIso
      });
    }
    for (const [catName, limit] of Object.entries(data.budgets || {})) {
      if (Number(limit) > 0) {
        const catId = toCategorySlug(userId, catName);
        budgetRows.push({
          id: `bgt_${userId.slice(0, 8)}_${catId}`,
          user_id: userId,
          category_id: catId,
          month: currentMonth,
          limit_minor: toMinor(Number(limit)),
          updated_at: nowIso
        });
      }
    }
    if (budgetRows.length > 0) {
      await supabase.from('budgets').upsert(budgetRows, { onConflict: 'id' });
    }

    // 7. Delete removed rows from relational tables
    const activeTxIds = new Set(txExpensesAndTransfers.map(t => t.id));
    const activeRepayIds = new Set(repayments.map(t => t.id));
    const activeBgtIds = new Set(budgetRows.map(b => b.id));
    const activeCustomCatIds = new Set(customCats.map(name => toCategorySlug(userId, name)));

    const [existingAcc, existingTx, existingAdj, existingBgt, existingCats] = await Promise.all([
      supabase.from('accounts').select('id').eq('user_id', userId).is('deleted_at', null),
      supabase.from('transactions').select('id').eq('user_id', userId).is('deleted_at', null),
      supabase
        .from('balance_adjustments')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null),
      supabase.from('budgets').select('id').eq('user_id', userId),
      supabase.from('categories').select('id').eq('user_id', userId)
    ]);

    const removedTxIds = (existingTx.data || [])
      .map((r: any) => r.id)
      .filter((id: string) => !activeTxIds.has(id));
    if (removedTxIds.length > 0) {
      await supabase.from('transactions').delete().eq('user_id', userId).in('id', removedTxIds);
    }

    const removedAdjIds = (existingAdj.data || [])
      .map((r: any) => r.id)
      .filter((id: string) => !activeRepayIds.has(id));
    if (removedAdjIds.length > 0) {
      await supabase
        .from('balance_adjustments')
        .delete()
        .eq('user_id', userId)
        .in('id', removedAdjIds);
    }

    const removedAccIds = (existingAcc.data || [])
      .map((r: any) => r.id)
      .filter((id: string) => !accountIds.has(id));
    if (removedAccIds.length > 0) {
      await supabase.from('accounts').delete().eq('user_id', userId).in('id', removedAccIds);
    }

    const removedBgtIds = (existingBgt.data || [])
      .map((r: any) => r.id)
      .filter((id: string) => !activeBgtIds.has(id));
    if (removedBgtIds.length > 0) {
      await supabase.from('budgets').delete().eq('user_id', userId).in('id', removedBgtIds);
    }

    const removedCatIds = (existingCats.data || [])
      .map((r: any) => r.id)
      .filter((id: string) => !activeCustomCatIds.has(id));
    if (removedCatIds.length > 0) {
      await supabase.from('categories').delete().eq('user_id', userId).in('id', removedCatIds);
    }

    return { ok: true, updatedAt: nowIso };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save to Supabase' };
  }
}

export async function fetchLiveSupabaseData(
  userId: string
): Promise<{
  ok: boolean;
  data?: SyncData;
  opening?: Record<string, number>;
  updatedAt?: string;
  error?: string;
}> {
  try {
    // Fetch live relational tables AND user_app_state in parallel
    const [stateRes, accRes, txRes, adjRes, catRes, bgtRes] = await Promise.all([
      supabase
        .from('user_app_state')
        .select('data, opening, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false }),
      supabase
        .from('balance_adjustments')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false }),
      supabase.from('categories').select('*'),
      supabase.from('budgets').select('*').eq('user_id', userId)
    ]);

    if (stateRes.error) throw stateRes.error;
    if (accRes.error) throw accRes.error;
    if (txRes.error) throw txRes.error;
    if (adjRes.error) throw adjRes.error;

    const stateRow = stateRes.data;
    const stateData = (stateRow?.data || {}) as Partial<SyncData>;

    const dbAccounts = accRes.data || [];
    const dbTx = txRes.data || [];
    const dbAdj = adjRes.data || [];
    const dbCats = catRes.data || [];
    const dbBgts = bgtRes.data || [];

    // If relational tables have rows, build live accounts & transactions directly from relational tables
    // while preserving exact local date/time strings or metadata from stateData when matching IDs exist.
    if (dbAccounts.length > 0 || dbTx.length > 0 || dbAdj.length > 0) {
      const catMap = new Map<string, string>();
      dbCats.forEach((c: any) => catMap.set(c.id, c.name));

      const stateTxMap = new Map<string, SyncTransaction>();
      (stateData.tx || []).forEach(t => stateTxMap.set(t.id, t));

      const opening: Record<string, number> = { init: 1 };
      const accounts: SyncAccount[] = dbAccounts.map((a: any) => {
        const openBal = fromMinor(a.opening_balance_minor);
        opening[a.id] = openBal;
        return {
          id: a.id,
          name: a.name,
          type: a.type === 'cash' ? 'Cash Account' : 'Bank Account',
          balance: openBal,
          color: a.color || '#647be8'
        };
      });

      const mappedTx: SyncTransaction[] = [
        ...dbTx.map((t: any) => {
          const prev = stateTxMap.get(t.id);
          const dt = new Date(t.occurred_at || t.created_at);
          const dateStr =
            prev?.date ||
            `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          const timeStr =
            prev?.time ||
            `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
          const isTransfer = t.type === 'transfer';
          return {
            id: t.id,
            type: isTransfer ? 'Transfer' : 'Expense',
            amount: fromMinor(t.amount_minor),
            category: isTransfer
              ? 'Transfer'
              : catMap.get(t.category_id) || prev?.category || 'Food',
            from: isTransfer ? t.from_account_id || '' : t.account_id || '',
            to: isTransfer ? t.to_account_id || '' : '',
            date: dateStr,
            time: timeStr,
            note: t.note || t.title || '',
            payment: t.payment_method === 'cash' ? 'Cash' : 'UPI'
          };
        }),
        ...dbAdj
          .filter((adj: any) => adj.kind === 'family_repayment')
          .map((adj: any) => {
            const prev = stateTxMap.get(adj.id);
            const dt = new Date(adj.occurred_at || adj.created_at);
            const dateStr =
              prev?.date ||
              `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            const timeStr =
              prev?.time ||
              `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            return {
              id: adj.id,
              type: 'Repayment',
              amount: Math.abs(fromMinor(adj.delta_minor)),
              category: 'Repayment',
              from: adj.account_id || '',
              to: '',
              date: dateStr,
              time: timeStr,
              note: adj.note || 'Repayment to Father',
              payment: 'UPI'
            };
          })
      ];

      let totalBudget = Number(stateData.budget) || 0;
      const catBudgets: Record<string, number> = { ...(stateData.budgets || {}) };
      dbBgts.forEach((b: any) => {
        if (!b.category_id) {
          totalBudget = fromMinor(b.limit_minor);
        } else {
          const cName = catMap.get(b.category_id);
          if (cName) catBudgets[cName] = fromMinor(b.limit_minor);
        }
      });

      const userCustomCats = dbCats
        .filter((c: any) => c.user_id === userId && !DEFAULT_CAT_IDS[c.name])
        .map((c: any) => c.name);

      const syncedAccounts = recalculateBalances(accounts, mappedTx, opening);

      return {
        ok: true,
        data: {
          accounts: syncedAccounts,
          tx: mappedTx,
          budget: totalBudget,
          currency: stateData.currency || 'INR',
          theme: stateData.theme || 'system',
          dateFormat: stateData.dateFormat || 'DD MMM YYYY',
          categories: Array.from(new Set([...(stateData.categories || []), ...userCustomCats])),
          budgets: catBudgets,
          goals: stateData.goals || []
        },
        opening,
        updatedAt: stateRow?.updated_at || new Date().toISOString()
      };
    }

    // If relational tables are empty, check stateRow or return clean empty state
    if (stateRow && stateRow.data && Array.isArray((stateRow.data as any).accounts)) {
      const rawData = stateRow.data as SyncData;
      const rawOpening = (stateRow.opening as Record<string, number>) || { init: 1 };
      const syncedAccounts = recalculateBalances(
        rawData.accounts || [],
        rawData.tx || [],
        rawOpening
      );
      return {
        ok: true,
        data: { ...rawData, accounts: syncedAccounts },
        opening: rawOpening,
        updatedAt: stateRow.updated_at
      };
    }

    return {
      ok: true,
      data: {
        accounts: [],
        tx: [],
        budget: 0,
        currency: 'INR',
        theme: 'system',
        dateFormat: 'DD MMM YYYY',
        categories: [],
        budgets: {},
        goals: []
      },
      opening: { init: 1 }
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to load live data from Supabase' };
  }
}

export function subscribeToLiveSupabase(
  userId: string,
  onChange: () => void
): RealtimeChannel {
  return supabase
    .channel(`tg-live-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_app_state', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'balance_adjustments',
        filter: `user_id=eq.${userId}`
      },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();
}

