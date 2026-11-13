import { Suspense, lazy, useEffect, useMemo, useState, useRef } from 'react';
import {
  Home,
  Activity,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowLeftRight,
  Trash2,
  Search,
  Moon,
  Sun,
  Download,
  Landmark,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Utensils,
  ShoppingBag,
  Car,
  Receipt,
  HeartPulse,
  GraduationCap,
  Film,
  Plane,
  Repeat,
  Check,
  X,
  CalendarDays,
  Sparkles,
  SlidersHorizontal,
  TrendingDown,
  Upload,
  FileText,
  Printer,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { recalculateBalances } from './ledger';
import {
  supabase,
  TUSHAR_USER_ID,
  TUSHAR_USER_NAME,
  saveLiveSupabaseData,
  fetchLiveSupabaseData,
  subscribeToLiveSupabase
} from './supabase';
import './style.css';

const MonthlyChart = lazy(() => import('./Charts').then(m => ({ default: m.MonthlyChart })));
const AnalyticsChart = lazy(() => import('./Charts').then(m => ({ default: m.AnalyticsChart })));

type A = { id: string; name: string; type: string; balance: number; color?: string };
type T = {
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
type Goal = { id: string; name: string; target: number; saved: number };
type D = {
  accounts: A[];
  tx: T[];
  budget: number;
  currency?: string;
  theme?: string;
  dateFormat?: string;
  categories?: string[];
  budgets?: Record<string, number>;
  goals?: Goal[];
};

const key = 'tg-expense-data';
const empty: D = {
  accounts: [],
  tx: [],
  budget: 0,
  currency: 'INR',
  theme: 'system',
  dateFormat: 'DD MMM YYYY',
  categories: [],
  budgets: {},
  goals: []
};

function toLocalDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalMonthString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getMonthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - i, 1);
    return {
      value: toLocalMonthString(d),
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    };
  });
}

function getSixMonthsEndingAt(selectedMonth: string): { key: string; label: string }[] {
  const [yStr, mStr] = selectedMonth.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const monthIndex = (Number(mStr) || new Date().getMonth() + 1) - 1;
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, monthIndex - 5 + i, 1);
    return {
      key: toLocalMonthString(d),
      label: d.toLocaleDateString('en-IN', { month: 'short' })
    };
  });
}

const isCashAccount = (a: A) =>
  a.type.toLowerCase().includes('cash') || a.name.toLowerCase().includes('cash');

const isBankAccount = (a: A) => !isCashAccount(a);

let activeCurrencyCode = 'INR';
let activeDateFormat = 'DD MMM YYYY';

const getCurrencyCode = () => activeCurrencyCode || 'INR';
const getCurrencySymbol = (code = getCurrencyCode()) =>
  code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : '₹';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: getCurrencyCode(),
    maximumFractionDigits: 0
  }).format(Number.isFinite(n) ? n : 0);

const dateLabel = (s: string) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00');
  if (Number.isNaN(d.getTime())) return s;
  const format = activeDateFormat || 'DD MMM YYYY';
  return format === 'DD/MM/YYYY'
    ? d.toLocaleDateString('en-GB')
    : format === 'MMM D, YYYY'
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const uid = () => Math.random().toString(36).slice(2, 9);

const cats = [
  'Food',
  'Shopping',
  'Transport',
  'Bills',
  'Housing',
  'Healthcare',
  'Education',
  'Entertainment',
  'Travel',
  'Subscriptions',
  'Personal Care',
  'Other'
];

const catIcons: Record<string, any> = {
  Food: Utensils,
  Shopping: ShoppingBag,
  Transport: Car,
  Bills: Receipt,
  Housing: Landmark,
  Healthcare: HeartPulse,
  Education: GraduationCap,
  Entertainment: Film,
  Travel: Plane,
  Subscriptions: Repeat,
  'Personal Care': Sparkles,
  Other: Receipt
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const roundCurrency = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function accountDelta(accountId: string, txList: T[]): number {
  return txList.reduce((sum, t) => {
    if (!Number.isFinite(t.amount) || t.amount <= 0) return sum;
    const source =
      t.from === accountId
        ? t.type === 'Income' || t.type === 'Received'
          ? t.amount
          : -t.amount
        : 0;
    const movesBetweenAccounts =
      t.type === 'Transfer' || t.type === 'Cash Withdrawal' || t.type === 'Cash Deposit';
    const destination = movesBetweenAccounts && t.to === accountId ? t.amount : 0;
    return roundCurrency(sum + source + destination);
  }, 0);
}

function normalizeTransactions(txList: T[]): T[] {
  return txList
    .filter(
      t =>
        t.type === 'Expense' ||
        t.type === 'Transfer' ||
        t.type === 'Repayment' ||
        t.type === 'Cash Withdrawal' ||
        t.type === 'Cash Deposit'
    )
    .map(t =>
      t.type === 'Cash Withdrawal' || t.type === 'Cash Deposit'
        ? { ...t, type: 'Transfer', category: 'Transfer' }
        : t
    );
}

// Clear any legacy offline localStorage data so TG Expense runs 100% live from Supabase
try {
  localStorage.removeItem(key);
  localStorage.removeItem(key + '-open');
  localStorage.removeItem(key + '-ledger-v2');
  localStorage.removeItem('tg-local-updated-at');
  localStorage.removeItem('tg-currency');
  localStorage.removeItem('tg-date-format');
  localStorage.removeItem('tg-theme');
} catch {}

function App() {
  const [d, S] = useState<D>(empty);
  const [page, P] = useState('Home');
  const [dialog, Q] = useState(false);
  const [kind, K] = useState('Expense');
  const [edit, E] = useState<T | null>(null);
  const [detailTx, SDT] = useState<T | null>(null);
  const [search, H] = useState('');
  const [transferFilter, TF] = useState('All');
  const [categoryFilter, CF] = useState('All categories');
  const [accountFilter, AF] = useState('All accounts');
  const [paymentFilter, PF] = useState('All methods');
  const [dateFrom, DF] = useState('');
  const [dateTo, DT] = useState('');
  const [txMonth, TM] = useState(() => toLocalMonthString());
  const [dark, B] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [notice, N] = useState('');
  const [splash, SS] = useState(true);
  const [hidden, Z] = useState(false);
  const [accountDialog, AD] = useState(false);
  const [editingAccount, EA] = useState<A | null>(null);
  const [statementOpen, SO] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [cloudLastSync, setCloudLastSync] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const skipNextLiveSave = useRef(false);
  const liveLoaded = useRef(false);
  const savingInFlight = useRef(false);
  const lastLocalWriteAt = useRef(0);
  const [opening, O] = useState<Record<string, number>>({ init: 1 });

  activeCurrencyCode = d.currency || 'INR';
  activeDateFormat = d.dateFormat || 'DD MMM YYYY';

  const refreshFromSupabase = async (uid: string = TUSHAR_USER_ID, silent = true) => {
    if (!navigator.onLine) {
      setCloudStatus('error');
      return;
    }
    if (!silent) {
      setIsRefreshing(true);
      setCloudStatus('syncing');
    }
    const res = await fetchLiveSupabaseData(uid);
    if (!silent) {
      setTimeout(() => setIsRefreshing(false), 450);
    }
    if (res.ok && res.data) {
      skipNextLiveSave.current = true;
      activeCurrencyCode = res.data.currency || 'INR';
      activeDateFormat = res.data.dateFormat || 'DD MMM YYYY';
      S({ ...empty, ...res.data });
      if (res.opening) O(res.opening);
      if (res.data.theme) {
        B(
          res.data.theme === 'dark' ||
            (res.data.theme === 'system' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches)
        );
      }
      liveLoaded.current = true;
      setCloudStatus('synced');
      setCloudLastSync(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } else if (!silent) {
      setCloudStatus('error');
    }
  };

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      refreshFromSupabase(TUSHAR_USER_ID, true);
    };
    const goOffline = () => {
      setIsOnline(false);
      setCloudStatus('error');
    };
    // Lock browser reload keys (F5 / Ctrl+R / Cmd+R) so the page never hard-reloads
    const lockBrowserReload = (e: KeyboardEvent) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        refreshFromSupabase(TUSHAR_USER_ID, false);
      }
    };
    // Lock mobile two-finger / pull-down overscroll refresh
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY || 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY || 0;
      if (window.scrollY <= 0 && currentY > startY + 10 && e.cancelable) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('.dialog, .tx-table, .statement-preview-body')) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('keydown', lockBrowserReload);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('keydown', lockBrowserReload);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    if (d.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => B(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [d.theme]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => N(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const t = setTimeout(() => SS(false), 380);
    return () => clearTimeout(t);
  }, []);

  // Automatic Silent Live Fetch + Supabase Realtime Stream + Background Heartbeat
  useEffect(() => {
    let cancelled = false;
    refreshFromSupabase(TUSHAR_USER_ID, true);

    const canSilentRefresh = () =>
      !cancelled &&
      !savingInFlight.current &&
      Date.now() - lastLocalWriteAt.current > 1500 &&
      navigator.onLine;

    const channel = subscribeToLiveSupabase(TUSHAR_USER_ID, () => {
      if (canSilentRefresh()) {
        refreshFromSupabase(TUSHAR_USER_ID, true);
      }
    });

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && canSilentRefresh()) {
        refreshFromSupabase(TUSHAR_USER_ID, true);
      }
    };

    const autoLiveTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && canSilentRefresh()) {
        refreshFromSupabase(TUSHAR_USER_ID, true);
      }
    }, 12000);

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      cancelled = true;
      clearInterval(autoLiveTimer);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  // Direct Live Write to Supabase whenever state changes in memory
  useEffect(() => {
    if (!liveLoaded.current) return;
    if (skipNextLiveSave.current) {
      skipNextLiveSave.current = false;
      return;
    }
    if (!navigator.onLine) {
      setCloudStatus('error');
      N('Offline — connect to the internet to save changes to Supabase');
      return;
    }
    lastLocalWriteAt.current = Date.now();
    const timer = setTimeout(async () => {
      savingInFlight.current = true;
      lastLocalWriteAt.current = Date.now();
      setCloudStatus('syncing');
      const res = await saveLiveSupabaseData(TUSHAR_USER_ID, d, opening);
      savingInFlight.current = false;
      lastLocalWriteAt.current = Date.now();
      if (res.ok) {
        setCloudStatus('synced');
        setCloudLastSync(
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        );
      } else {
        setCloudStatus('error');
        N(res.error || 'Failed to write to Supabase');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [d, opening]);

  const [selectedMonth, SM] = useState(() => toLocalMonthString());
  const [budgetCategory, BC] = useState('Food');
  const [budgetAmount, BA] = useState('');
  const [categoryDraft, CD] = useState('');
  const [goalName, GN] = useState('');
  const [goalTarget, GT] = useState('');
  const [analyticsPeriod, AP] = useState('monthly');
  const [customFrom, CUF] = useState('');
  const [customTo, CUT] = useState('');

  const monthOptions = useMemo(() => {
    const baseOpts = getMonthOptions(12);
    const seen = new Set(baseOpts.map(o => o.value));
    for (const t of d.tx) {
      const m = t.date?.slice(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m) && !seen.has(m)) {
        seen.add(m);
        const [y, mo] = m.split('-').map(Number);
        const dt = new Date(y, mo - 1, 1);
        baseOpts.push({
          value: m,
          label: dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        });
      }
    }
    return baseOpts.sort((a, b) => b.value.localeCompare(a.value));
  }, [d.tx]);

  const monthTx = d.tx.filter(t => t.date.startsWith(selectedMonth));
  const expense = monthTx.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
  const monthExpenseCount = monthTx.filter(t => t.type === 'Expense').length;
  const total = d.accounts.reduce((s, a) => s + a.balance, 0);
  const bankTotal = d.accounts.filter(isBankAccount).reduce((s, a) => s + a.balance, 0);
  const cashTotal = d.accounts.filter(isCashAccount).reduce((s, a) => s + a.balance, 0);
  const name = (id: string) => d.accounts.find(a => a.id === id)?.name || 'Deleted Account';

  const recompute = (list: T[], acc: A[], base: Record<string, number>) =>
    recalculateBalances(acc, list, base);

  const getBase = () => {
    const base = { ...opening };
    if (!base.init) {
      d.accounts.forEach(a => {
        base[a.id] = roundCurrency(a.balance - accountDelta(a.id, d.tx));
      });
      base.init = 1;
      O(base);
    }
    return base;
  };

  const save = (raw: T) => {
    if (!navigator.onLine) {
      N('You are offline — connect to the internet to save to Supabase');
      return false;
    }
    const fallbackNote =
      raw.type === 'Repayment'
        ? 'Repayment to Father'
        : raw.type === 'Transfer'
          ? 'Bank ↔ Cash Transfer'
          : raw.category || 'Expense';
    const f: T = { ...raw, note: raw.note.trim() || fallbackNote };
    if (!Number.isFinite(f.amount) || f.amount <= 0 || !f.date || !f.category)
      return false;
    const base = getBase();
    const list = edit ? d.tx.map(t => (t.id === edit.id ? f : t)) : [f, ...d.tx];
    const accounts = recompute(list, d.accounts, base);
    const causesOverdraft = accounts.some(a => {
      if (a.type === 'Credit Card') return false;
      const prev = d.accounts.find(x => x.id === a.id)?.balance ?? 0;
      return a.balance < 0 && a.balance < prev;
    });
    if (causesOverdraft) return false;
    S({ ...d, tx: list, accounts });
    Q(false);
    E(null);
    N(
      edit
        ? 'Saved live to Supabase'
        : f.type === 'Repayment'
          ? 'Repayment saved live to Supabase'
          : f.type === 'Transfer'
            ? 'Transfer saved live to Supabase'
            : 'Expense saved live to Supabase'
    );
    return true;
  };

  const del = (t: T) => {
    if (!navigator.onLine) {
      N('You are offline — connect to the internet to delete from Supabase');
      return;
    }
    if (!confirm('Delete this record from live Supabase database?')) return;
    const base = getBase();
    const list = d.tx.filter(x => x.id !== t.id);
    S({ ...d, tx: list, accounts: recompute(list, d.accounts, base) });
    N('Deleted from Supabase');
  };

  const deleteAccount = (a: A) => {
    if (!navigator.onLine) {
      N('You are offline — connect to the internet to delete from Supabase');
      return;
    }
    const hasTx = d.tx.some(t => t.from === a.id || t.to === a.id);
    const msg = hasTx
      ? `Delete "${a.name}" and remove its associated records from Supabase?`
      : `Delete "${a.name}" from Supabase?`;
    if (!confirm(msg)) return;
    const base = { ...getBase() };
    delete base[a.id];
    O(base);
    const nextAccounts = d.accounts.filter(x => x.id !== a.id);
    const nextTx = d.tx.filter(t => t.from !== a.id && t.to !== a.id);
    S({ ...d, accounts: recompute(nextTx, nextAccounts, base), tx: nextTx });
    if (accountFilter === a.id) AF('All accounts');
    N('Account deleted from Supabase');
  };

  const open = (type: string) => {
    K(type);
    E(null);
    Q(true);
  };

  const addAccount = () => {
    EA(null);
    AD(true);
  };

  const editAccount = (a: A) => {
    EA(a);
    AD(true);
  };

  const saveAccount = (a: A, targetCurrentBalance: number) => {
    if (!navigator.onLine) {
      N('You are offline — connect to the internet to update Supabase');
      return;
    }
    const exists = d.accounts.some(x => x.id === a.id);
    const base = { ...getBase() };
    const delta = exists ? accountDelta(a.id, d.tx) : 0;
    base[a.id] = roundCurrency(targetCurrentBalance - delta);
    O(base);
    const accounts = exists
      ? d.accounts.map(x => (x.id === a.id ? { ...a, balance: targetCurrentBalance } : x))
      : [...d.accounts, { ...a, balance: targetCurrentBalance }];
    S({ ...d, accounts: recompute(d.tx, accounts, base) });
    AD(false);
    EA(null);
    N(exists ? 'Account balance updated in Supabase' : 'Account created in Supabase');
  };

  const txMonthOptions = useMemo(() => {
    if (txMonth === 'ALL' || monthOptions.some(o => o.value === txMonth)) {
      return monthOptions;
    }
    const [y, mo] = txMonth.split('-').map(Number);
    const dt = new Date(y, mo - 1, 1);
    return [
      ...monthOptions,
      {
        value: txMonth,
        label: dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      }
    ].sort((a, b) => b.value.localeCompare(a.value));
  }, [monthOptions, txMonth]);

  const shiftTxMonth = (delta: number) => {
    const base = txMonth === 'ALL' ? toLocalMonthString() : txMonth;
    const [yStr, mStr] = base.split('-');
    const y = Number(yStr) || new Date().getFullYear();
    const m = (Number(mStr) || new Date().getMonth() + 1) - 1;
    TM(toLocalMonthString(new Date(y, m + delta, 1)));
  };

  const recentExpenses = useMemo(
    () =>
      d.tx
        .filter(t => t.type === 'Expense')
        .sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')),
    [d.tx]
  );

  // Strict Expense-only rows for Transactions (month-scoped by default)
  const expenseRows = useMemo(
    () =>
      d.tx
        .filter(t => {
          if (t.type !== 'Expense') return false;
          const matchesMonth =
            Boolean(dateFrom || dateTo) || txMonth === 'ALL' || t.date.startsWith(txMonth);
          const matchesSearch = (t.note + ' ' + t.category + ' ' + name(t.from))
            .toLowerCase()
            .includes(search.toLowerCase());
          const matchesCat =
            categoryFilter === 'All categories' || t.category === categoryFilter;
          const matchesAcc = accountFilter === 'All accounts' || t.from === accountFilter;
          const normalizedPayment = t.payment === 'Cash' ? 'Cash' : 'UPI';
          const matchesPay =
            paymentFilter === 'All methods' ||
            t.payment === paymentFilter ||
            normalizedPayment === paymentFilter;
          const matchesFrom = !dateFrom || t.date >= dateFrom;
          const matchesTo = !dateTo || t.date <= dateTo;
          return (
            matchesMonth &&
            matchesSearch &&
            matchesCat &&
            matchesAcc &&
            matchesPay &&
            matchesFrom &&
            matchesTo
          );
        })
        .sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')),
    [
      d.tx,
      d.accounts,
      txMonth,
      search,
      categoryFilter,
      accountFilter,
      paymentFilter,
      dateFrom,
      dateTo
    ]
  );

  // Strict Transfer & Repayment rows for the separate Bank Transfers page
  const transferRows = useMemo(
    () =>
      d.tx
        .filter(
          t =>
            (t.type === 'Repayment' || t.type === 'Transfer') &&
            (transferFilter === 'All' || t.type === transferFilter)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')),
    [d.tx, transferFilter]
  );

  const totalRepaid = useMemo(
    () => d.tx.filter(t => t.type === 'Repayment').reduce((s, t) => s + t.amount, 0),
    [d.tx]
  );

  const totalTransferred = useMemo(
    () => d.tx.filter(t => t.type === 'Transfer').reduce((s, t) => s + t.amount, 0),
    [d.tx]
  );

  // 6-month chart anchored to selectedMonth without day-overflow bugs
  const charts = useMemo(
    () =>
      getSixMonthsEndingAt(selectedMonth).map(({ key: mKey, label }) => ({
        month: label,
        expense: d.tx
          .filter(t => t.type === 'Expense' && t.date.startsWith(mKey))
          .reduce((s, t) => s + t.amount, 0)
      })),
    [d.tx, selectedMonth]
  );

  const reportData = useMemo(
    () => analyticsData(d.tx, d.accounts, analyticsPeriod, customFrom, customTo),
    [d.tx, d.accounts, analyticsPeriod, customFrom, customTo]
  );
  const reportExpense = roundCurrency(reportData.reduce((s, x) => s + x.expense, 0));

  const categoryRows = Object.entries(
    monthTx
      .filter(t => t.type === 'Expense')
      .reduce((o: Record<string, number>, t) => {
        o[t.category] = roundCurrency((o[t.category] || 0) + t.amount);
        return o;
      }, {})
  ).sort((a, b) => b[1] - a[1]);

  const analyticsCategoryRows = useMemo(() => {
    const expensesOnly = d.tx.filter(t => t.type === 'Expense');
    let filtered: T[] = [];
    if (analyticsPeriod === 'custom') {
      if (customFrom && customTo && customFrom <= customTo) {
        filtered = expensesOnly.filter(t => t.date >= customFrom && t.date <= customTo);
      }
    } else {
      const now = new Date();
      let start: Date;
      if (analyticsPeriod === 'daily') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      } else if (analyticsPeriod === 'weekly') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * 7);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      } else if (analyticsPeriod === 'yearly') {
        start = new Date(now.getFullYear() - 4, 0, 1);
      } else {
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      }
      start.setHours(0, 0, 0, 0);
      filtered = expensesOnly.filter(t => new Date(t.date + 'T12:00:00') >= start);
    }
    return Object.entries(
      filtered.reduce((o: Record<string, number>, t) => {
        o[t.category] = roundCurrency((o[t.category] || 0) + t.amount);
        return o;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [d.tx, analyticsPeriod, customFrom, customTo]);

  const nav = [
    ['Home', Home],
    ['Transactions', Activity],
    ['Accounts', Wallet],
    ['Bank Transfers', ArrowLeftRight],
    ['Analytics', ChartNoAxesCombined]
  ] as const;

  const openEdit = (t: T) => {
    E(t);
    K(t.type);
    Q(true);
  };

  const exportBackup = () =>
    download(JSON.stringify({ version: 1, data: d, opening }, null, 2), 'tg-expense-backup.json');

  const exportCsv = () => {
    const data = [
      ['Date', 'Type', 'Category', 'Description', 'Account', 'Destination', 'Payment', 'Amount'],
      ...d.tx.map(t => [
        t.date,
        t.type,
        t.category,
        t.note,
        name(t.from),
        t.type === 'Transfer' ? name(t.to) : '',
        t.payment || '',
        String(t.amount)
      ])
    ]
      .map(r => r.map(x => '"' + String(x).replaceAll('"', '""') + '"').join(','))
      .join('\n');
    download(data, 'tg-expense-transactions.csv');
  };

  const restore = async (file: File) => {
    if (!navigator.onLine) {
      N('You are offline — connect to the internet to import into Supabase');
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      const x = raw.data || raw;
      if (
        !Array.isArray(x.accounts) ||
        !Array.isArray(x.tx) ||
        x.accounts.some((a: any) => !a.id || !a.name || !Number.isFinite(Number(a.balance))) ||
        x.tx.some(
          (t: any) =>
            !t.id ||
            !Number.isFinite(Number(t.amount)) ||
            Number(t.amount) <= 0 ||
            !t.date ||
            ![
              'Income',
              'Received',
              'Expense',
              'Transfer',
              'Repayment',
              'Cash Withdrawal',
              'Cash Deposit'
            ].includes(t.type)
        )
      )
        throw new Error('invalid');
      if (
        (d.accounts.length ||
          d.tx.length ||
          d.categories?.length ||
          Object.keys(d.budgets || {}).length ||
          d.goals?.length ||
          d.budget > 0) &&
        !confirm('Replace the live data in your Supabase database with this backup?')
      )
        return;

      const restoredBase: Record<string, number> = { ...(raw.opening || {}) };
      if (!restoredBase.init) {
        for (const a of x.accounts) {
          restoredBase[a.id] = roundCurrency(Number(a.balance || 0) - accountDelta(a.id, x.tx));
        }
        restoredBase.init = 1;
      } else {
        for (const a of x.accounts) {
          if (restoredBase[a.id] === undefined) {
            restoredBase[a.id] = roundCurrency(Number(a.balance || 0) - accountDelta(a.id, x.tx));
          }
        }
      }
      for (const t of x.tx) {
        if ((t.type === 'Received' || t.type === 'Income') && t.from) {
          restoredBase[t.from] = roundCurrency((restoredBase[t.from] ?? 0) + Number(t.amount || 0));
        }
      }
      const cleanTx = normalizeTransactions(x.tx as T[]);
      const syncedAccounts = recalculateBalances(x.accounts, cleanTx, restoredBase);
      S({ ...empty, ...x, accounts: syncedAccounts, tx: cleanTx });
      O(restoredBase);
      N('Backup restored live to Supabase');
    } catch {
      N('Invalid or unsupported backup file');
    }
  };

  const budgetPct = d.budget > 0 ? Math.min(100, (expense / d.budget) * 100) : 0;

  const toggleTheme = () => {
    const value = !dark;
    B(value);
    S({ ...d, theme: value ? 'dark' : 'light' });
  };

  return (
    <div className={dark ? 'app dark' : 'app'}>
      {/* Ambient Liquid Glass Aurora Background */}
      <div className="ambient-canvas" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>

      {/* Desktop Glass Sidebar */}
      <aside className="glass-sidebar">
        <div className="brand" onClick={() => P('Home')}>
          <span className="brand-mark">✳</span>
          <div className="brand-text">
            TG <b>Expense</b>
          </div>
        </div>

        <small className="label">NAVIGATION</small>
        <div className="nav-list">
          {nav.map(([n, I]: any) => (
            <button
              className={page === n ? 'nav active' : 'nav'}
              onClick={() => P(n)}
              key={n}
            >
              <I size={18} />
              <span>{n}</span>
            </button>
          ))}
          <button
            className={page === 'Settings' ? 'nav active' : 'nav'}
            onClick={() => P('Settings')}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>

        <div className="side-quick-add">
          <button className="primary full-btn" onClick={() => open('Expense')}>
            <Plus size={17} /> Add Expense
          </button>
        </div>

        <div className="side-bottom glass-inset">
          <div className="side-budget-head">
            <small>MONTHLY BUDGET</small>
            <span
              className={
                budgetPct >= 100
                  ? 'badge-pill red'
                  : budgetPct >= 80
                    ? 'badge-pill amber'
                    : 'badge-pill'
              }
            >
              {d.budget > 0 ? `${Math.round(budgetPct)}%` : 'Not set'}
            </span>
          </div>
          <h3>{money(Math.max(0, d.budget - expense))}</h3>
          <div className="track">
            <i
              className={budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'near' : ''}
              style={{ width: budgetPct + '%' }}
            />
          </div>
          <span>
            {d.budget > 0
              ? `${money(expense)} spent of ${money(d.budget)}`
              : 'Set a monthly budget in Settings'}
          </span>
        </div>
      </aside>

      <main className="main">
        {/* OriginOS 7 Liquid Glass Header (Mobile & Desktop) */}
        <header className="glass-header">
          <div className="header-crumb">
            <button
              type="button"
              className="mobile-brand-chip"
              onClick={() => P('Home')}
              aria-label="Go to Home"
            >
              <span>✳</span>
            </button>
            <span className="crumb-root">Workspace</span>
            <ChevronRight size={14} className="crumb-sep" />
            <b>{page === 'Transactions' ? 'Expenses' : page}</b>
          </div>
          <div className="header-actions">
            <div
              className={`cloud-sync-pill ${!isOnline ? 'error' : cloudStatus}`}
              title={`Auto-Live Supabase Stream (${TUSHAR_USER_NAME})`}
            >
              <span className="cloud-status-dot" />
              <span className="cloud-sync-text">
                {!isOnline
                  ? 'Offline'
                  : cloudStatus === 'syncing'
                    ? 'Saving...'
                    : cloudStatus === 'error'
                      ? 'Connection Error'
                      : `${TUSHAR_USER_NAME} · Live`}
              </span>
            </div>
            <div className="month-pill-wrap">
              <CalendarDays size={14} />
              <select
                aria-label="Selected month"
                className="header-month-select"
                value={selectedMonth}
                onChange={e => SM(e.target.value)}
              >
                {monthOptions.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={isRefreshing ? 'icon-glass spinning' : 'icon-glass'}
              onClick={() => refreshFromSupabase(TUSHAR_USER_ID, false)}
              aria-label="In-app live refresh"
              title="In-app instant refresh (Browser reload is locked)"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-glass"
              onClick={() => Z(!hidden)}
              aria-label={hidden ? 'Show balances' : 'Hide balances'}
              title={hidden ? 'Show balances' : 'Hide balances'}
            >
              {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
            <button
              className="icon-glass"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className={page === 'Settings' ? 'avatar active' : 'avatar'}
              onClick={() => P('Settings')}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        <article key={page} className="page-stage">
          {/* ================= HOME PAGE ================= */}
          {page === 'Home' && (
            <>
              <div className="mobile-greeting">
                <div>
                  <small className="date-pill">
                    {new Date().toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                  </small>
                  <h1>
                    {getGreeting()}, {TUSHAR_USER_NAME}
                  </h1>
                </div>
                <div className="mobile-top-actions">
                  <button className="secondary" onClick={() => SO(true)}>
                    <FileText size={15} /> PDF
                  </button>
                  <button className="primary" onClick={() => open('Expense')}>
                    <Plus size={16} /> Expense
                  </button>
                </div>
              </div>

              <div className="heading desktop-heading">
                <div>
                  <small className="label">YOUR SPENDING & ACCOUNTS</small>
                  <h1>
                    {getGreeting()}, {TUSHAR_USER_NAME}
                  </h1>
                  <p>Track your daily expenses across Bank and Cash accounts.</p>
                </div>
                <div className="desktop-QuickBar">
                  <button className="secondary" onClick={() => SO(true)}>
                    <FileText size={16} /> Monthly Statement
                  </button>
                  <button
                    className="secondary"
                    onClick={() => (d.accounts[0] ? editAccount(d.accounts[0]) : addAccount())}
                  >
                    <Wallet size={16} /> Update Balance
                  </button>
                  <button className="secondary" onClick={() => P('Bank Transfers')}>
                    <ArrowLeftRight size={16} /> Bank Transfers & Repayments
                  </button>
                  <button className="primary" onClick={() => open('Expense')}>
                    <Plus size={17} /> Add Expense
                  </button>
                </div>
              </div>

              {/* Hero Balance & Spending Grid */}
              <div className="hero-grid">
                <section className="balance-card">
                  <div className="balance-card-glow" />
                  <div className="balance-card-sheen" />
                  <div className="balance-title">
                    <span className="balance-badge">
                      <Sparkles size={13} /> Available Balance (Bank + Cash)
                    </span>
                    <button
                      onClick={() => Z(!hidden)}
                      aria-label={hidden ? 'Show balance' : 'Hide balance'}
                    >
                      {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                  <strong>{hidden ? '••••••••' : money(total)}</strong>
                  <div className="balance-meta">
                    <small>
                      Bank: {hidden ? '••••' : money(bankTotal)} · Cash:{' '}
                      {hidden ? '••••' : money(cashTotal)}
                    </small>
                    <span className="net-flow-pill">
                      {hidden ? '••••' : money(expense)} spent this month
                    </span>
                  </div>

                  {/* Quick Actions tailored to exact workflow */}
                  <div className="hero-quick-actions">
                    <button onClick={() => open('Expense')}>
                      <span className="hq-icon expense">
                        <ArrowUpRight size={17} />
                      </span>
                      <span>Add Expense</span>
                    </button>
                    <button
                      onClick={() => (d.accounts[0] ? editAccount(d.accounts[0]) : addAccount())}
                    >
                      <span className="hq-icon income">
                        <Wallet size={17} />
                      </span>
                      <span>Update Balance</span>
                    </button>
                    <button onClick={() => open('Transfer')}>
                      <span className="hq-icon transfer">
                        <ArrowLeftRight size={17} />
                      </span>
                      <span>Bank ↔ Cash</span>
                    </button>
                    <button onClick={() => open('Repayment')}>
                      <span className="hq-icon repay">
                        <Repeat size={16} />
                      </span>
                      <span>Repay Father</span>
                    </button>
                  </div>
                </section>

                {/* Spending Metrics + Monthly Budget Stack */}
                <div className="hero-side-stack">
                  <section className="metrics mobile-metrics">
                    <div className="metric metric-expense">
                      <div className="metric-top">
                        <span>Expenses this month</span>
                        <span className="metric-badge red-bg">
                          <TrendingDown size={14} />
                        </span>
                      </div>
                      <h2 className="red">{hidden ? '••••••' : money(expense)}</h2>
                      <small>
                        {monthExpenseCount} {monthExpenseCount === 1 ? 'expense' : 'expenses'} logged
                      </small>
                    </div>
                    <div className="metric">
                      <div className="metric-top">
                        <span>Bank & Cash accounts</span>
                        <span className="metric-badge green-bg">
                          <Landmark size={14} />
                        </span>
                      </div>
                      <h2 className="green">{hidden ? '••••••' : money(total)}</h2>
                      <small>Tap an account below to top up</small>
                    </div>
                  </section>

                  <section className="panel monthly-budget-card">
                    <div className="section-title">
                      <div>
                        <h3>Monthly budget</h3>
                        <small>
                          {d.budget > 0
                            ? `${money(Math.max(0, d.budget - expense))} remaining in selected month`
                            : 'Set a target to track your monthly spending'}
                        </small>
                      </div>
                      <button className="link-pill" onClick={() => P('Settings')}>
                        Edit
                      </button>
                    </div>
                    <div className="budget-progress">
                      <i
                        className={budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'near' : ''}
                        style={{ width: budgetPct + '%' }}
                      />
                    </div>
                    <div className="budget-footer-row">
                      <small className="budget-caption">
                        {money(expense)} spent of {money(d.budget)}
                      </small>
                      <small className="budget-pct-label">{Math.round(budgetPct)}%</small>
                    </div>
                  </section>
                </div>
              </div>

              {/* Accounts Strip */}
              <section className="accounts-section">
                <div className="section-title">
                  <div>
                    <h3>Your Bank & Cash accounts</h3>
                    <small>Tap any account to update its balance when you receive funds</small>
                  </div>
                  <button className="link" onClick={() => P('Accounts')}>
                    Manage <ChevronRight size={15} />
                  </button>
                </div>
                <div className="account-strip">
                  {d.accounts.length ? (
                    <>
                      {d.accounts.map(a => (
                        <div
                          className="account-tile"
                          key={a.id}
                          onClick={() => editAccount(a)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="account-tile-head">
                            <span
                              className="accicon"
                              style={{
                                background: (a.color || '#647be8') + '24',
                                color: a.color || '#647be8'
                              }}
                            >
                              {isCashAccount(a) ? <Wallet size={17} /> : <Landmark size={17} />}
                            </span>
                            <span className="account-type-tag">
                              {isCashAccount(a) ? 'Cash' : 'Bank'}
                            </span>
                          </div>
                          <small>{a.name}</small>
                          <b>{hidden ? '••••' : money(a.balance)}</b>
                        </div>
                      ))}
                      {d.accounts.length < 2 && (
                        <button className="account-tile add-tile" onClick={addAccount}>
                          <Plus size={20} />
                          <small>Add Bank / Cash</small>
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="account-tile add-tile" onClick={addAccount}>
                      <Plus size={20} />
                      <small>Add Bank or Cash account</small>
                    </button>
                  )}
                </div>
              </section>

              {/* Two-column Spending Chart & Category Breakdown */}
              <div className="dashboard-two-col">
                <section className="panel home-chart">
                  <div className="section-title">
                    <div>
                      <h3>Monthly spending</h3>
                      <small>6-month expense trend</small>
                    </div>
                    <div className="section-controls">
                      <select
                        aria-label="Selected month"
                        className="month-select"
                        value={selectedMonth}
                        onChange={e => SM(e.target.value)}
                      >
                        {monthOptions.map(m => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <button className="link" onClick={() => P('Analytics')}>
                        Details <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                  {!d.tx.some(t => t.type === 'Expense') ? (
                    <div className="chart-empty">
                      <span>✳</span>
                      <b>Your spending chart will appear here</b>
                      <small>Add expenses to see your monthly spending curve.</small>
                    </div>
                  ) : (
                    <div className="chart">
                      <Suspense fallback={<div className="chart-loading" />}>
                        <MonthlyChart data={charts} money={money} />
                      </Suspense>
                    </div>
                  )}
                </section>

                <section className="panel category-analytics">
                  <div className="section-title">
                    <div>
                      <h3>Spending by category</h3>
                      <small>Top categories this month</small>
                    </div>
                    {categoryRows.length > 0 && (
                      <button className="link" onClick={() => P('Analytics')}>
                        All <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                  {categoryRows.length ? (
                    <div className="category-list">
                      {categoryRows.slice(0, 5).map(([c, value]) => {
                        const Icon = catIcons[c] || Receipt;
                        const share = expense > 0 ? Math.round((value / expense) * 100) : 0;
                        return (
                          <div className="category-spend" key={c}>
                            <div className="cat-spend-head">
                              <span className="cat-label-group">
                                <span className="cat-mini-icon">
                                  <Icon size={14} />
                                </span>
                                <b>{c}</b>
                                <small className="cat-share-badge">{share}%</small>
                              </span>
                              <strong>{money(value)}</strong>
                            </div>
                            <div className="budget-progress">
                              <i
                                style={{
                                  width:
                                    Math.min(100, (value / (categoryRows[0]?.[1] || 1)) * 100) + '%'
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="chart-empty compact">
                      <span>
                        <ShoppingBag size={18} />
                      </span>
                      <b>No expenses this month</b>
                      <small>Add an expense to see category breakdown.</small>
                    </div>
                  )}
                </section>
              </div>

              {/* Recent Expenses Only */}
              <section className="panel recent-section">
                <div className="section-title">
                  <div>
                    <h3>Recent expenses</h3>
                    <small>
                      Only actual expenses are listed here (repayments & transfers are in Bank
                      Transfers)
                    </small>
                  </div>
                  <button className="link" onClick={() => P('Transactions')}>
                    See all <ChevronRight size={15} />
                  </button>
                </div>
                {recentExpenses.length ? (
                  <TxTable
                    items={recentExpenses.slice(0, 6)}
                    name={name}
                    onSelect={SDT}
                    onEdit={openEdit}
                    onDelete={del}
                  />
                ) : (
                  <div className="empty-card flat">
                    <span className="empty-icon">
                      <Activity />
                    </span>
                    <b>No expenses recorded yet</b>
                    <small>Add your first expense to start tracking your spending.</small>
                    <button className="primary" onClick={() => open('Expense')}>
                      <Plus size={17} /> Add expense
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ================= TRANSACTIONS (EXPENSES ONLY) PAGE ================= */}
          {page === 'Transactions' && (
            <>
              <div className="heading">
                <div>
                  <small className="label">PURE SPENDING LOG</small>
                  <h1>Expenses</h1>
                  <p>
                    Only your actual expenses are tracked here. Transfers and repayments to your
                    father are kept separate on the Bank Transfers page.
                  </p>
                </div>
                <button className="primary" onClick={() => open('Expense')}>
                  <Plus size={17} /> Add Expense
                </button>
              </div>

              {/* Month Switcher Bar */}
              <div className="tx-month-bar">
                <div className="tx-month-controls">
                  <button
                    type="button"
                    className="icon tx-month-nav"
                    aria-label="Previous month"
                    onClick={() => shiftTxMonth(-1)}
                    title="Previous month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <select
                    aria-label="Filter expenses by month"
                    className="tx-month-select"
                    value={txMonth}
                    onChange={e => TM(e.target.value)}
                  >
                    <option value="ALL">All months</option>
                    {txMonthOptions.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon tx-month-nav"
                    aria-label="Next month"
                    onClick={() => shiftTxMonth(1)}
                    title="Next month"
                  >
                    <ChevronRight size={16} />
                  </button>
                  {txMonth !== toLocalMonthString() && (
                    <button
                      type="button"
                      className="tx-month-today"
                      onClick={() => TM(toLocalMonthString())}
                    >
                      Current
                    </button>
                  )}
                </div>
                <div className="tx-month-total">
                  <span>
                    {dateFrom || dateTo
                      ? 'Custom range'
                      : txMonth === 'ALL'
                        ? 'All-time expenses'
                        : `${txMonthOptions.find(m => m.value === txMonth)?.label || txMonth} expenses`}
                  </span>
                  <b>{money(expenseRows.reduce((s, t) => s + t.amount, 0))}</b>
                </div>
              </div>

              {/* Quick Category Filter Pills */}
              <div className="type-filter-strip">
                {['All categories', ...cats.slice(0, 7)].map(cat => (
                  <button
                    key={cat}
                    className={categoryFilter === cat ? 'filter-chip active' : 'filter-chip'}
                    onClick={() => CF(cat)}
                  >
                    {cat === 'All categories' ? 'All Expenses' : cat}
                  </button>
                ))}
              </div>

              <section className="panel">
                <div className="transaction-search">
                  <div className="search">
                    <Search size={17} />
                    <input
                      placeholder="Search expenses by note, category, or account..."
                      value={search}
                      onChange={e => H(e.target.value)}
                    />
                    {search && (
                      <button
                        className="clear-search"
                        onClick={() => H('')}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <details className="transaction-filters">
                  <summary>
                    <SlidersHorizontal size={14} /> Filter expenses
                    {(categoryFilter !== 'All categories' ||
                      accountFilter !== 'All accounts' ||
                      paymentFilter !== 'All methods' ||
                      dateFrom ||
                      dateTo) && <span className="active-filter-dot" />}
                  </summary>
                  <div className="tools filter-tools">
                    <select
                      aria-label="Filter by category"
                      value={categoryFilter}
                      onChange={e => CF(e.target.value)}
                    >
                      <option>All categories</option>
                      {[...cats, ...(d.categories || [])].map(x => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by account"
                      value={accountFilter}
                      onChange={e => AF(e.target.value)}
                    >
                      <option value="All accounts">All accounts</option>
                      {d.accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by payment method"
                      value={paymentFilter}
                      onChange={e => PF(e.target.value)}
                    >
                      <option>All methods</option>
                      {['Cash', 'UPI'].map(x => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <input
                      aria-label="From date"
                      type="date"
                      value={dateFrom}
                      onChange={e => DF(e.target.value)}
                    />
                    <input
                      aria-label="To date"
                      type="date"
                      value={dateTo}
                      onChange={e => DT(e.target.value)}
                    />
                  </div>
                </details>

                {expenseRows.length ? (
                  <>
                    <div className="tx-summary-bar">
                      <span>
                        Showing {expenseRows.length}{' '}
                        {expenseRows.length === 1 ? 'expense' : 'expenses'}
                        {accountFilter !== 'All accounts' ? ` in ${name(accountFilter)}` : ''} ·
                        Total: <b>{money(expenseRows.reduce((s, t) => s + t.amount, 0))}</b>
                      </span>
                      {(categoryFilter !== 'All categories' ||
                        accountFilter !== 'All accounts' ||
                        paymentFilter !== 'All methods' ||
                        dateFrom ||
                        dateTo ||
                        search) && (
                        <button
                          className="link"
                          onClick={() => {
                            H('');
                            CF('All categories');
                            AF('All accounts');
                            PF('All methods');
                            DF('');
                            DT('');
                          }}
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                    <TxTable items={expenseRows} groupedByDate name={name} onSelect={SDT} onEdit={openEdit} onDelete={del} />
                  </>
                ) : (
                  <Empty
                    title="No expenses found"
                    text={
                      d.tx.some(t => t.type === 'Expense')
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Add your first expense to begin tracking your spending.'
                    }
                    action={() => open('Expense')}
                  />
                )}
              </section>
            </>
          )}

          {/* ================= ACCOUNTS PAGE ================= */}
          {page === 'Accounts' && (
            <>
              <div className="heading">
                <div>
                  <small className="label">BANK & CASH WALLETS</small>
                  <h1>My Accounts</h1>
                  <p>
                    Update your Bank or Cash balance directly whenever your father sends money—no
                    income logging required.
                  </p>
                </div>
                <button className="primary" onClick={addAccount}>
                  <Plus size={17} /> Add account
                </button>
              </div>

              <section className="balance-card account-total">
                <div className="balance-card-glow" />
                <span className="balance-badge">Combined Bank & Cash balance</span>
                <strong>{hidden ? '••••••••' : money(total)}</strong>
                <small>
                  {d.accounts.length} {d.accounts.length === 1 ? 'account' : 'accounts'} linked
                </small>
              </section>

              {d.accounts.length ? (
                <div className="accounts">
                  {d.accounts.map(a => {
                    const accSpent = d.tx
                      .filter(t => t.type === 'Expense' && t.from === a.id)
                      .reduce((s, t) => s + t.amount, 0);
                    return (
                      <div
                        className="panel account-card"
                        key={a.id}
                        style={{ borderTop: `3px solid ${a.color || '#647be8'}` }}
                      >
                        <div className="account-card-top">
                          <span
                            className="accicon"
                            style={{
                              background: (a.color || '#647be8') + '22',
                              color: a.color || '#647be8'
                            }}
                          >
                            {isCashAccount(a) ? <Wallet /> : <Landmark />}
                          </span>
                          <span className="account-badge-pill">{a.type}</span>
                        </div>
                        <h3>{a.name}</h3>
                        <h2>{hidden ? '••••' : money(a.balance)}</h2>
                        <div className="account-mini-stats">
                          <small className="red">{money(accSpent)} spent from this account</small>
                        </div>
                        <div className="account-actions">
                          <button className="primary" onClick={() => editAccount(a)}>
                            <Edit3 size={14} /> Update Balance
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              AF(a.id);
                              P('Transactions');
                            }}
                          >
                            Expenses
                          </button>
                          <button className="danger" onClick={() => deleteAccount(a)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="No accounts yet"
                  text="Add your Bank Account and Cash Account to track your balances."
                  action={addAccount}
                />
              )}
            </>
          )}

          {/* ================= BANK TRANSFERS & REPAYMENTS PAGE ================= */}
          {page === 'Bank Transfers' && (
            <>
              <div className="heading">
                <div>
                  <small className="label">SEPARATE FROM EXPENSES</small>
                  <h1>Repayments & Bank ↔ Cash Transfers</h1>
                  <p>
                    Log money returned to your father or transfer funds between Bank and Cash.
                    Nothing on this page is counted as an expense.
                  </p>
                </div>
                <button className="secondary" onClick={() => SO(true)}>
                  <FileText size={16} /> Monthly PDF Statement
                </button>
              </div>

              <section className="transfer-options">
                <div className="panel transfer-feature-card">
                  <span className="quickicon expense">
                    <Repeat />
                  </span>
                  <h3>Return money to Father (Repayment)</h3>
                  <p>
                    When your father asks for money back, log it here as a repayment. It reduces
                    your Bank balance and never inflates your expense totals.
                  </p>
                  <button className="primary" onClick={() => open('Repayment')}>
                    <Plus size={17} /> Record a repayment
                  </button>
                </div>
                <div className="panel transfer-feature-card">
                  <span className="quickicon transfer">
                    <ArrowLeftRight />
                  </span>
                  <h3>Transfer: Bank ↔ Cash</h3>
                  <p>
                    Withdraw cash from your Bank or deposit Cash into your Bank. Your combined
                    balance stays the same and it is not an expense.
                  </p>
                  <button className="secondary" onClick={() => open('Transfer')}>
                    <ArrowLeftRight size={17} /> Transfer between Bank & Cash
                  </button>
                </div>
              </section>

              <section className="metrics mobile-metrics">
                <div className="metric">
                  <span>Total returned to Father</span>
                  <h2>{hidden ? '••••••' : money(totalRepaid)}</h2>
                  <small>Excluded from expenses</small>
                </div>
                <div className="metric">
                  <span>Total moved Bank ↔ Cash</span>
                  <h2>{hidden ? '••••••' : money(totalTransferred)}</h2>
                  <small>Internal account transfers</small>
                </div>
              </section>

              <div className="type-filter-strip">
                {[
                  ['All', 'All Records'],
                  ['Repayment', 'Repayments to Father'],
                  ['Transfer', 'Bank ↔ Cash Transfers']
                ].map(([val, label]) => (
                  <button
                    key={val}
                    className={transferFilter === val ? 'filter-chip active' : 'filter-chip'}
                    onClick={() => TF(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <h3>Repayment & transfer log</h3>
                    <small>Separate ledger for non-expense movements</small>
                  </div>
                </div>
                {transferRows.length ? (
                  <TxTable
                    items={transferRows}
                    name={name}
                    onSelect={SDT}
                    onEdit={openEdit}
                    onDelete={del}
                  />
                ) : (
                  <Empty
                    title="No repayments or transfers yet"
                    text="Record money returned to your father or move money between Bank and Cash."
                    action={() => open('Repayment')}
                  />
                )}
              </section>
            </>
          )}

          {/* ================= ANALYTICS PAGE ================= */}
          {page === 'Analytics' && (
            <>
              <div className="heading">
                <div>
                  <small className="label">SPENDING INSIGHTS</small>
                  <h1>Analytics</h1>
                  <p>Analyze your spending habits across categories and accounts.</p>
                </div>
                <button className="secondary" onClick={() => SO(true)}>
                  <FileText size={16} /> Monthly PDF Statement
                </button>
              </div>

              <div className="analytics-filter panel compact-panel">
                <label>
                  <span>Report period</span>
                  <select value={analyticsPeriod} onChange={e => AP(e.target.value)}>
                    <option value="daily">Daily · 7 days</option>
                    <option value="weekly">Weekly · 8 weeks</option>
                    <option value="monthly">Monthly · 6 months</option>
                    <option value="yearly">Yearly · 5 years</option>
                    <option value="custom">Custom range</option>
                  </select>
                </label>
                {analyticsPeriod === 'custom' && (
                  <div className="range-inputs">
                    <input
                      aria-label="Start date"
                      type="date"
                      value={customFrom}
                      onChange={e => CUF(e.target.value)}
                    />
                    <input
                      aria-label="End date"
                      type="date"
                      value={customTo}
                      onChange={e => CUT(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {d.tx.some(t => t.type === 'Expense') ? (
                <>
                  <section className="metrics analytics-metrics">
                    <div className="metric">
                      <span>Expenses · {analyticsPeriod}</span>
                      <h2 className="red">{money(reportExpense)}</h2>
                      <small>Exact total spent in period</small>
                    </div>
                    <div className="metric">
                      <span>Selected month spend</span>
                      <h2 className="red">{money(expense)}</h2>
                      <small>{monthExpenseCount} expenses recorded</small>
                    </div>
                    <div className="metric">
                      <span>Available across accounts</span>
                      <h2 className="green">{money(total)}</h2>
                      <small>Bank + Cash combined</small>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-title">
                      <div>
                        <h3>Interactive spending analytics · {analyticsPeriod}</h3>
                        <small>
                          Switch between Area Curve, Category Donut Ring, and Bank vs. Cash Bar
                          comparison
                        </small>
                      </div>
                    </div>
                    <Suspense fallback={<div className="chart tall chart-loading" />}>
                      <AnalyticsChart
                        data={reportData}
                        categories={analyticsCategoryRows}
                        money={money}
                      />
                    </Suspense>
                  </section>

                  <div className="dashboard-two-col">
                    <section className="panel category-analytics">
                      <div className="section-title">
                        <div>
                          <h3>Category spending · selected month</h3>
                          <small>Breakdown across categories</small>
                        </div>
                      </div>
                      {categoryRows.length ? (
                        categoryRows.map(([c, value]) => {
                          const Icon = catIcons[c] || Receipt;
                          return (
                            <div className="category-spend" key={c}>
                              <div className="cat-spend-head">
                                <span className="cat-label-group">
                                  <span className="cat-mini-icon">
                                    <Icon size={14} />
                                  </span>
                                  <b>{c}</b>
                                </span>
                                <strong>{money(value)}</strong>
                              </div>
                              <div className="budget-progress">
                                <i
                                  style={{
                                    width:
                                      Math.min(100, (value / (categoryRows[0]?.[1] || 1)) * 100) +
                                      '%'
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="muted">No expenses recorded for this month.</p>
                      )}
                    </section>

                    <section className="panel analytics-accounts">
                      <div className="section-title">
                        <div>
                          <h3>Account balances & spending</h3>
                          <small>Bank vs. Cash utilization</small>
                        </div>
                      </div>
                      {d.accounts.length ? (
                        d.accounts.map(a => (
                          <div className="account" key={a.id}>
                            <span
                              className="accicon"
                              style={{
                                background: (a.color || '#647be8') + '22',
                                color: a.color || '#647be8'
                              }}
                            >
                              {isCashAccount(a) ? <Wallet /> : <Landmark />}
                            </span>
                            <span>
                              <b>{a.name}</b>
                              <small>
                                {a.type} ·{' '}
                                {money(
                                  d.tx
                                    .filter(t => t.type === 'Expense' && t.from === a.id)
                                    .reduce((s, t) => s + t.amount, 0)
                                )}{' '}
                                spent
                              </small>
                            </span>
                            <strong>{money(a.balance)}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="muted">Add accounts to see balance distribution.</p>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <Empty
                  title="Analytics are waiting"
                  text="Your spending charts and category insights will appear after you add expenses."
                  action={() => open('Expense')}
                />
              )}
            </>
          )}

          {/* ================= SETTINGS PAGE ================= */}
          {page === 'Settings' && (
            <>
              <div className="heading">
                <div>
                  <small className="label">YOUR PREFERENCES</small>
                  <h1>Settings</h1>
                  <p>Personalize TG Expense, set budgets, and manage your live Supabase database.</p>
                </div>
              </div>

              <div className="settings-grid">
                <section className="panel settings supabase-sync-panel">
                  <div className="supabase-split-layout">
                    <div className="supabase-info-col">
                      <div className="supabase-title-row">
                        <span className="supabase-icon-orb">
                          <Cloud size={20} />
                        </span>
                        <div>
                          <small className="label">100% LIVE ONLINE DATABASE</small>
                          <h3>Supabase Live · Expensese</h3>
                        </div>
                        <span className={`cloud-badge ${!isOnline ? 'error' : cloudStatus}`}>
                          <span className="cloud-status-dot" />
                          {!isOnline
                            ? 'Offline'
                            : cloudStatus === 'syncing'
                              ? 'Updating Live...'
                              : cloudStatus === 'error'
                                ? 'Connection Error'
                                : 'Live Connected'}
                        </span>
                      </div>

                      <p className="supabase-desc">
                        All accounts, balances, expenses, transfers, and repayments are read and
                        written directly to your live Supabase database in real time. No offline
                        storage is kept on this device.
                      </p>

                      <div className="supabase-feature-pills">
                        <span className="supa-feature-chip">
                          <Check size={13} /> 100% Online Live Data
                        </span>
                        <span className="supa-feature-chip">
                          <Check size={13} /> Real-Time Postgres Stream
                        </span>
                        <span className="supa-feature-chip">
                          <Check size={13} /> Zero Offline Cache
                        </span>
                      </div>
                    </div>

                    <div className="supabase-card-col">
                      <div className="supabase-connected-box">
                        <div className="supabase-user-meta">
                          <div>
                            <small>WORKSPACE OWNER</small>
                            <b>{TUSHAR_USER_NAME}</b>
                          </div>
                          {cloudLastSync && (
                            <div className="sync-time-chip">
                              Live as of <b>{cloudLastSync}</b>
                            </div>
                          )}
                        </div>

                        <div className="supabase-sync-actions">
                          <span className="supa-feature-chip">
                            <Check size={13} /> Auto-Live Stream Active (No Refresh Needed)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel settings">
                  <h3>Preferences</h3>
                  <label>
                    <span>Currency</span>
                    <select
                      value={d.currency || 'INR'}
                      onChange={e => {
                        activeCurrencyCode = e.target.value;
                        S({ ...d, currency: e.target.value });
                      }}
                    >
                      <option value="INR">INR · ₹</option>
                      <option value="USD">USD · $</option>
                      <option value="EUR">EUR · €</option>
                      <option value="GBP">GBP · £</option>
                    </select>
                  </label>
                  <label>
                    <span>Appearance</span>
                    <select
                      value={d.theme || 'system'}
                      onChange={e => {
                        const t = e.target.value;
                        B(
                          t === 'dark' ||
                            (t === 'system' &&
                              window.matchMedia('(prefers-color-scheme: dark)').matches)
                        );
                        S({ ...d, theme: t });
                      }}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label>
                    <span>Date format</span>
                    <select
                      value={d.dateFormat || 'DD MMM YYYY'}
                      onChange={e => {
                        activeDateFormat = e.target.value;
                        S({ ...d, dateFormat: e.target.value });
                      }}
                    >
                      <option>DD MMM YYYY</option>
                      <option>DD/MM/YYYY</option>
                      <option>MMM D, YYYY</option>
                    </select>
                  </label>
                  <label>
                    <span>Monthly total budget</span>
                    <input
                      type="number"
                      min="0"
                      value={d.budget}
                      onChange={e => S({ ...d, budget: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>
                </section>

                <section className="panel settings">
                  <h3>Category budgets</h3>
                  <p>Set monthly limits and see how much remains in each category.</p>
                  <div className="budget-create">
                    <select
                      aria-label="Budget category"
                      value={budgetCategory}
                      onChange={e => BC(e.target.value)}
                    >
                      {cats.concat(d.categories || []).map(c => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Budget amount"
                      type="number"
                      min="1"
                      placeholder="Monthly limit"
                      value={budgetAmount}
                      onChange={e => BA(e.target.value)}
                    />
                    <button
                      aria-label="Add category budget"
                      className="primary"
                      onClick={() => {
                        const amount = Number(budgetAmount);
                        if (amount > 0) {
                          S({ ...d, budgets: { ...(d.budgets || {}), [budgetCategory]: amount } });
                          BA('');
                        }
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {Object.entries(d.budgets || {}).map(([c, limit]) => {
                    const spent = monthTx
                      .filter(t => t.type === 'Expense' && t.category === c)
                      .reduce((s, t) => s + t.amount, 0);
                    const pct = Math.min(100, (spent / (Number(limit) || 1)) * 100);
                    return (
                      <div className="budget-row" key={c}>
                        <div>
                          <b>{c}</b>
                          <small>
                            {money(spent)} of {money(Number(limit))}
                            {pct >= 100 ? ' · Over budget' : pct >= 80 ? ' · Near limit' : ''}
                          </small>
                        </div>
                        <input
                          aria-label={c + ' budget'}
                          type="number"
                          min="0"
                          value={Number(limit)}
                          onChange={e =>
                            S({
                              ...d,
                              budgets: {
                                ...(d.budgets || {}),
                                [c]: Math.max(0, Number(e.target.value))
                              }
                            })
                          }
                        />
                        <button
                          className="icon"
                          aria-label={'Delete ' + c + ' budget'}
                          onClick={() => {
                            const next = { ...(d.budgets || {}) };
                            delete next[c];
                            S({ ...d, budgets: next });
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className="budget-progress">
                          <i
                            className={pct >= 100 ? 'over' : pct >= 80 ? 'near' : ''}
                            style={{ width: pct + '%' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </section>

                <section className="panel settings">
                  <h3>Savings goals</h3>
                  <p>Track progress toward something you are saving for.</p>
                  <div className="goal-create">
                    <input
                      aria-label="Goal name"
                      placeholder="Goal name"
                      value={goalName}
                      onChange={e => GN(e.target.value)}
                    />
                    <input
                      aria-label="Goal target"
                      type="number"
                      min="1"
                      placeholder="Target amount"
                      value={goalTarget}
                      onChange={e => GT(e.target.value)}
                    />
                    <button
                      aria-label="Add savings goal"
                      className="primary"
                      onClick={() => {
                        const target = Number(goalTarget);
                        if (goalName.trim() && target > 0) {
                          S({
                            ...d,
                            goals: [
                              ...(d.goals || []),
                              { id: uid(), name: goalName.trim(), target, saved: 0 }
                            ]
                          });
                          GN('');
                          GT('');
                        }
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {(d.goals || []).map(g => (
                    <div className="goal-row" key={g.id}>
                      <div className="goal-head">
                        <input
                          aria-label="Edit goal name"
                          className="goal-name"
                          value={g.name}
                          onChange={e =>
                            S({
                              ...d,
                              goals: (d.goals || []).map(x =>
                                x.id === g.id ? { ...x, name: e.target.value } : x
                              )
                            })
                          }
                        />
                        <button
                          className="icon"
                          aria-label="Delete goal"
                          onClick={() =>
                            S({ ...d, goals: (d.goals || []).filter(x => x.id !== g.id) })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="goal-values">
                        <span>{money(g.saved)} saved</span>
                        <label>
                          Target{' '}
                          <input
                            className="goal-target"
                            aria-label="Edit goal target"
                            type="number"
                            min="1"
                            value={g.target}
                            onChange={e =>
                              S({
                                ...d,
                                goals: (d.goals || []).map(x =>
                                  x.id === g.id
                                    ? { ...x, target: Math.max(1, Number(e.target.value)) }
                                    : x
                                )
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="budget-progress">
                        <i style={{ width: Math.min(100, (g.saved / (g.target || 1)) * 100) + '%' }} />
                      </div>
                      <label>
                        <span>Saved so far</span>
                        <input
                          type="number"
                          min="0"
                          max={g.target}
                          value={g.saved}
                          onChange={e =>
                            S({
                              ...d,
                              goals: (d.goals || []).map(x =>
                                x.id === g.id
                                  ? { ...x, saved: Math.max(0, Number(e.target.value)) }
                                  : x
                              )
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </section>

                <section className="panel settings">
                  <h3>Custom categories</h3>
                  <p>Create personalized categories for your expenses.</p>
                  <div className="budget-create">
                    <input
                      aria-label="New category"
                      placeholder="Category name"
                      value={categoryDraft}
                      onChange={e => CD(e.target.value)}
                    />
                    <button
                      className="primary"
                      onClick={() => {
                        const c = categoryDraft.trim();
                        if (
                          c &&
                          ![...cats, ...(d.categories || [])].some(
                            x => x.toLowerCase() === c.toLowerCase()
                          )
                        ) {
                          S({ ...d, categories: [...(d.categories || []), c] });
                          CD('');
                        }
                      }}
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  <div className="custom-categories">
                    {(d.categories || []).map(c => (
                      <span key={c}>
                        {c}
                        <button
                          aria-label={'Remove ' + c}
                          onClick={() => {
                            if (
                              confirm(
                                'Remove this category? Existing transactions remain unchanged.'
                              )
                            ) {
                              const nextBudgets = { ...(d.budgets || {}) };
                              delete nextBudgets[c];
                              if (categoryFilter === c) CF('All categories');
                              if (budgetCategory === c) BC('Food');
                              S({
                                ...d,
                                categories: (d.categories || []).filter(x => x !== c),
                                budgets: nextBudgets
                              });
                            }
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="panel settings span-full">
                  <h3>Reports & exports</h3>
                  <p>
                    Your financial records are stored 100% live in your Supabase database. Generate
                    statements or export CSV/JSON anytime.
                  </p>
                  <div className="data-actions">
                    <button className="primary" onClick={() => SO(true)}>
                      <FileText size={15} /> Monthly PDF Statement
                    </button>
                    <button className="secondary" onClick={exportBackup}>
                      <Download size={15} /> Export JSON
                    </button>
                    <button className="secondary" onClick={exportCsv}>
                      <Download size={15} /> Export CSV
                    </button>
                    <label className="secondary file-upload-btn">
                      <Upload size={15} /> Import JSON
                      <input
                        type="file"
                        accept="application/json"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (file) restore(file);
                        }}
                      />
                    </label>
                    <button
                      className="danger"
                      onClick={() => {
                        if (!navigator.onLine) {
                          N('You are offline — connect to the internet to clear Supabase data');
                          return;
                        }
                        if (confirm('Clear all finance data in your live Supabase database?')) {
                          activeCurrencyCode = 'INR';
                          activeDateFormat = 'DD MMM YYYY';
                          S(empty);
                          O({ init: 1 });
                          B(false);
                          H('');
                          CF('All categories');
                          AF('All accounts');
                          PF('All methods');
                          DF('');
                          DT('');
                          TF('All');
                          SM(toLocalMonthString());
                          N('All live Supabase data cleared');
                        }
                      }}
                    >
                      <Trash2 size={15} /> Clear all data
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
        </article>
      </main>

      {/* Mobile Glass Bottom Navigation */}
      <nav className="bottom-nav">
        {nav.map(([n, I]) => (
          <button
            className={page === n ? 'active' : ''}
            onClick={() => P(n)}
            key={n}
          >
            <I size={20} />
            <span>
              {n === 'Transactions'
                ? 'Expenses'
                : n === 'Bank Transfers'
                  ? 'Transfers'
                  : n}
            </span>
          </button>
        ))}
      </nav>

      {/* Modals & Notifications */}
      {accountDialog && (
        <AccountDialog
          key={editingAccount?.id || 'new-account'}
          initial={editingAccount}
          accounts={d.accounts}
          currentBalance={editingAccount ? editingAccount.balance : 0}
          onSelectAccount={acc => EA(acc)}
          onClose={() => {
            AD(false);
            EA(null);
          }}
          onSave={saveAccount}
        />
      )}

      {detailTx && (
        <TxDetailDialog
          tx={detailTx}
          accountName={name}
          onClose={() => SDT(null)}
          onEdit={() => {
            const target = detailTx;
            SDT(null);
            openEdit(target);
          }}
          onDelete={() => {
            const target = detailTx;
            SDT(null);
            del(target);
          }}
        />
      )}

      {dialog && (
        <TxDialog
          kind={kind}
          edit={edit}
          accounts={d.accounts}
          onClose={() => {
            Q(false);
            E(null);
          }}
          onAddAccount={() => {
            Q(false);
            addAccount();
          }}
          onSave={save}
          categories={[...cats, ...(d.categories || [])]}
        />
      )}

      {statementOpen && (
        <StatementDialog
          initialMonth={selectedMonth}
          accounts={d.accounts}
          opening={getBase()}
          tx={d.tx}
          userName={TUSHAR_USER_NAME}
          onClose={() => SO(false)}
        />
      )}

      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}

      {splash && (
        <div className="splash-screen">
          <span>✳</span>
          <b>TG Expense</b>
        </div>
      )}
    </div>
  );
}

function formatDateGroupHeader(isoDate: string): { dateText: string; weekdayText: string } {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { dateText: isoDate, weekdayText: '' };
  }
  return {
    dateText: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weekdayText: parsed.toLocaleDateString('en-US', { weekday: 'long' })
  };
}

function TxTable({
  items,
  groupedByDate = false,
  name,
  onSelect,
  onEdit,
  onDelete
}: {
  items: T[];
  groupedByDate?: boolean;
  name: (s: string) => string;
  onSelect?: (t: T) => void;
  onEdit: (t: T) => void;
  onDelete: (t: T) => void;
}) {
  const renderRow = (t: T, showDateInMeta: boolean) => {
    const CatIcon =
      t.type === 'Transfer'
        ? ArrowLeftRight
        : t.type === 'Repayment'
          ? Repeat
          : catIcons[t.category] || ArrowUpRight;

    return (
      <div
        className={onSelect ? 'txrow clickable' : 'txrow'}
        key={t.id}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? () => onSelect(t) : undefined}
        onKeyDown={
          onSelect
            ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t);
                }
              }
            : undefined
        }
      >
        <span
          className={
            'txicon ' +
            (t.type === 'Expense' || t.type === 'Repayment' ? 'expense' : 'transfer')
          }
        >
          <CatIcon size={17} />
        </span>
        <span className="txdesc">
          <b>{t.note || t.category}</b>
          <small>
            {t.type === 'Repayment'
              ? 'Repayment to Father'
              : t.type === 'Transfer'
                ? 'Bank ↔ Cash Transfer'
                : t.category}{' '}
            · {name(t.from)}
            {t.type === 'Transfer' && t.to ? ' → ' + name(t.to) : ''}
            {t.payment && t.type === 'Expense' ? ` · ${t.payment}` : ''}
            {showDateInMeta ? ` · ${dateLabel(t.date)}` : ''}
          </small>
        </span>
        <b
          className={
            t.type === 'Expense' || t.type === 'Repayment' ? 'tx-amount red' : 'tx-amount'
          }
        >
          {t.type === 'Expense' || t.type === 'Repayment' ? '−' : ''}
          {money(t.amount)}
        </b>
        <div className="row-actions">
          <button
            className="icon row-action"
            aria-label="Edit record"
            onClick={e => {
              e.stopPropagation();
              onEdit(t);
            }}
            title="Edit"
          >
            <Edit3 size={14} />
          </button>
          <button
            className="icon row-action delete-action"
            aria-label="Delete record"
            onClick={e => {
              e.stopPropagation();
              onDelete(t);
            }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  if (!groupedByDate) {
    return <div className="tx-table">{items.map(t => renderRow(t, true))}</div>;
  }

  const groups: { date: string; rows: T[]; expenseTotal: number; transferTotal: number }[] = [];
  const byDate = new Map<string, { date: string; rows: T[]; expenseTotal: number; transferTotal: number }>();

  for (const t of items) {
    let group = byDate.get(t.date);
    if (!group) {
      group = { date: t.date, rows: [], expenseTotal: 0, transferTotal: 0 };
      byDate.set(t.date, group);
      groups.push(group);
    }
    group.rows.push(t);
    if (t.type === 'Expense' || t.type === 'Repayment') {
      group.expenseTotal = roundCurrency(group.expenseTotal + t.amount);
    } else {
      group.transferTotal = roundCurrency(group.transferTotal + t.amount);
    }
  }

  return (
    <div className="tx-date-groups">
      {groups.map(group => {
        const { dateText, weekdayText } = formatDateGroupHeader(group.date);
        return (
          <section className="tx-date-group" key={group.date}>
            <div className="tx-date-head">
              <div className="tx-date-left">
                <span className="tx-date-label">{dateText}</span>
                {weekdayText && <span className="tx-date-weekday">{weekdayText}</span>}
              </div>
              <div className="tx-date-total">
                {group.expenseTotal > 0 ? (
                  <span>Expenses: {money(group.expenseTotal)}</span>
                ) : (
                  <span>Transfers: {money(group.transferTotal)}</span>
                )}
              </div>
            </div>
            <div className="tx-table">{group.rows.map(t => renderRow(t, false))}</div>
          </section>
        );
      })}
    </div>
  );
}

function Empty({
  title,
  text,
  action
}: {
  title: string;
  text: string;
  action: () => void;
}) {
  return (
    <div className="empty-card">
      <span className="empty-icon">
        <Activity />
      </span>
      <b>{title}</b>
      <small>{text}</small>
      <button className="primary" onClick={action}>
        <Plus size={17} /> Add record
      </button>
    </div>
  );
}

function TxDetailDialog({
  tx,
  accountName,
  onClose,
  onEdit,
  onDelete
}: {
  tx: T;
  accountName: (id: string) => string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const CatIcon =
    tx.type === 'Transfer'
      ? ArrowLeftRight
      : tx.type === 'Repayment'
        ? Repeat
        : catIcons[tx.category] || ArrowUpRight;

  const { dateText, weekdayText } = formatDateGroupHeader(tx.date);
  const typeLabel =
    tx.type === 'Repayment'
      ? 'Repayment to Father'
      : tx.type === 'Transfer'
        ? 'Bank ↔ Cash Transfer'
        : 'Expense';

  const accountDisplay =
    tx.type === 'Transfer' && tx.to
      ? `${accountName(tx.from)} → ${accountName(tx.to)}`
      : accountName(tx.from);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal tx-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modalhead">
          <div className="tx-detail-title-row">
            <span
              className={
                'txicon ' +
                (tx.type === 'Expense' || tx.type === 'Repayment' ? 'expense' : 'transfer')
              }
            >
              <CatIcon size={18} />
            </span>
            <div>
              <small className="label">{typeLabel.toUpperCase()}</small>
              <h2>{tx.note || tx.category || typeLabel}</h2>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="tx-detail-amount-card">
          <small>Total Amount</small>
          <strong
            className={
              tx.type === 'Expense' || tx.type === 'Repayment'
                ? 'tx-detail-amount red'
                : 'tx-detail-amount'
            }
          >
            {tx.type === 'Expense' || tx.type === 'Repayment' ? '−' : ''}
            {money(tx.amount)}
          </strong>
        </div>

        <div className="tx-detail-grid">
          <div className="tx-detail-item">
            <span>Type</span>
            <b>{typeLabel}</b>
          </div>
          <div className="tx-detail-item">
            <span>Category</span>
            <b>{tx.category || typeLabel}</b>
          </div>
          <div className="tx-detail-item">
            <span>Date</span>
            <b>
              {dateLabel(tx.date)}
              {weekdayText ? ` (${weekdayText})` : ` (${dateText})`}
            </b>
          </div>
          <div className="tx-detail-item">
            <span>Time</span>
            <b>{tx.time || 'Not recorded'}</b>
          </div>
          <div className="tx-detail-item">
            <span>Account</span>
            <b>{accountDisplay}</b>
          </div>
          <div className="tx-detail-item">
            <span>Payment Method</span>
            <b>{tx.payment || (tx.type === 'Transfer' ? 'Internal Transfer' : '—')}</b>
          </div>
          <div className="tx-detail-item full">
            <span>Note / Description</span>
            <b>{tx.note || 'No note added'}</b>
          </div>
          <div className="tx-detail-item full">
            <span>Reference ID</span>
            <b className="tx-detail-id">{tx.id}</b>
          </div>
        </div>

        <div className="tx-detail-actions">
          <button type="button" className="secondary" onClick={onEdit}>
            <Edit3 size={15} /> Edit
          </button>
          <button type="button" className="danger-btn" onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TxDialog({
  kind,
  edit,
  accounts,
  onClose,
  onAddAccount,
  onSave,
  categories
}: {
  kind: string;
  edit: T | null;
  accounts: A[];
  onClose: () => void;
  onAddAccount: () => void;
  onSave: (t: T) => boolean;
  categories: string[];
}) {
  const bankAcc = accounts.find(isBankAccount);
  const cashAcc = accounts.find(isCashAccount);

  const initialPayment = edit
    ? edit.payment === 'Cash' || (edit.from && isCashAccount(accounts.find(a => a.id === edit.from) || { id: '', name: '', type: '', balance: 0 }))
      ? 'Cash'
      : 'UPI'
    : bankAcc
      ? 'UPI'
      : 'Cash';

  const initialFrom = edit
    ? edit.from
    : kind === 'Repayment' || kind === 'Transfer'
      ? bankAcc?.id || accounts[0]?.id || ''
      : initialPayment === 'Cash'
        ? cashAcc?.id || accounts[0]?.id || ''
        : bankAcc?.id || accounts[0]?.id || '';

  const [f, F] = useState<T>(() =>
    edit
      ? {
          ...edit,
          payment: initialPayment,
          from: initialFrom
        }
      : {
          id: uid(),
          type: kind,
          amount: 0,
          category:
            kind === 'Transfer' ? 'Transfer' : kind === 'Repayment' ? 'Repayment' : 'Food',
          from: initialFrom,
          to:
            kind === 'Transfer'
              ? accounts.find(a => a.id !== initialFrom)?.id || ''
              : '',
          date: toLocalDateString(),
          time: new Date().toTimeString().slice(0, 5),
          note: '',
          payment: initialPayment
        }
  );
  const [err, R] = useState('');
  const submitted = useRef(false);

  const transfer = f.type === 'Transfer';
  const repayment = f.type === 'Repayment';
  const expenseCategories = [...cats, ...categories.filter(x => !cats.includes(x))];

  const selectedAccount = accounts.find(a => a.id === f.from);
  const bankAccounts = accounts.filter(isBankAccount);
  const cashAccounts = accounts.filter(isCashAccount);

  const accountForPayment = (method: string | undefined) => {
    if (method === 'Cash') {
      return selectedAccount && isCashAccount(selectedAccount) ? selectedAccount : cashAcc;
    }
    return selectedAccount && isBankAccount(selectedAccount) ? selectedAccount : bankAcc;
  };

  const activeAccount =
    transfer || repayment ? selectedAccount : accountForPayment(f.payment);
  const preEditBalance = activeAccount
    ? roundCurrency(
        activeAccount.balance +
          (edit && edit.from === activeAccount.id ? edit.amount : 0) -
          (edit && edit.type === 'Transfer' && edit.to === activeAccount.id ? edit.amount : 0)
      )
    : 0;
  const remainingBalance = activeAccount
    ? roundCurrency(preEditBalance - (Number(f.amount) || 0))
    : 0;

  const categoryNoteMap: Record<string, string[]> = {
    Food: ['Lunch & dining', 'Groceries & milk', 'Snacks & tea', 'Dinner'],
    Shopping: ['Clothes & essentials', 'Online order', 'Household items', 'Stationery'],
    Transport: ['Auto / Cab ride', 'Petrol / Fuel', 'Metro / Bus ticket', 'Parking'],
    Bills: ['Mobile recharge', 'Wi-Fi / Electricity', 'Utility bill', 'Gas cylinder'],
    Housing: ['Room rent', 'Hostel / PG fee', 'Maintenance', 'Repairs'],
    Healthcare: ['Medicines', 'Doctor consultation', 'Pharmacy', 'Lab test'],
    Health: ['Medicines', 'Doctor consultation', 'Pharmacy', 'Fitness'],
    Education: ['Books & notes', 'Course fee', 'Printouts & xerox', 'Exam fee'],
    Study: ['Books & notes', 'Course fee', 'Printouts & xerox', 'Exam fee'],
    Entertainment: ['Movie & outing', 'Cafe with friends', 'Games', 'Events'],
    Fun: ['Movie & outing', 'Cafe with friends', 'Games', 'Streaming'],
    Travel: ['Train booking', 'Flight / Bus ticket', 'Hotel stay', 'Trip expense'],
    Subscriptions: ['OTT streaming', 'Cloud storage', 'Music plan', 'App membership'],
    'Personal Care': ['Salon / Haircut', 'Skincare & grooming', 'Toiletries', 'Laundry'],
    Other: ['Daily expense', 'Personal purchase', 'Emergency', 'Miscellaneous']
  };

  const noteSuggestions = repayment
    ? ['Returned money to Father', 'Sent back to Dad', 'Requested return']
    : transfer
      ? ['Bank to Cash withdrawal', 'Cash deposited to Bank', 'ATM withdrawal']
      : categoryNoteMap[f.category] || ['Daily expense', 'Personal purchase', 'Miscellaneous'];

  const todayStr = toLocalDateString();
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yesterdayStr = toLocalDateString(yestDate);

  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog tx-dialog-enhanced"
        onSubmit={e => {
          e.preventDefault();
          if (!Number.isFinite(f.amount) || f.amount <= 0) {
            R('Enter an amount greater than zero.');
            return;
          }
          if (!accounts.length) {
            R('Add an account before recording this entry.');
            return;
          }
          if (!transfer && !repayment && !accountForPayment(f.payment)) {
            R(`Add a ${f.payment === 'Cash' ? 'Cash' : 'Bank'} account first.`);
            return;
          }
          if (repayment && !bankAcc) {
            R('Add a Bank Account before recording a repayment.');
            return;
          }
          if (transfer && (!f.to || f.to === f.from)) {
            R('Choose a different destination account (Bank ↔ Cash).');
            return;
          }
          if (submitted.current) return;
          submitted.current = true;
          if (!onSave(f)) {
            submitted.current = false;
            R('This entry would take the selected account below zero.');
          }
        }}
      >
        <div className="modalhead">
          <div>
            <small className="label">
              {repayment
                ? 'RETURN MONEY TO FATHER'
                : transfer
                  ? 'BANK ↔ CASH TRANSFER'
                  : 'ORIGIN OS 7 • QUICK EXPENSE'}
            </small>
            <h2>
              {edit
                ? `Edit ${f.type.toLowerCase()}`
                : repayment
                  ? 'Record repayment'
                  : transfer
                    ? 'Transfer funds'
                    : 'Add expense'}
            </h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {(repayment || transfer) && !edit && (
          <div className="tabs">
            {[
              ['Repayment', 'Return to Father'],
              ['Transfer', 'Bank ↔ Cash']
            ].map(([k, label]) => (
              <button
                type="button"
                className={f.type === k ? 'chosen' : ''}
                onClick={() => {
                  R('');
                  const nextFrom = bankAcc?.id || accounts[0]?.id || '';
                  F({
                    ...f,
                    type: k,
                    category: k,
                    from: nextFrom,
                    to:
                      k === 'Transfer'
                        ? accounts.find(a => a.id !== nextFrom)?.id || ''
                        : ''
                  });
                }}
                key={k}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Liquid Glass Amount Hero Card with Live Balance Preview */}
        <div className={`amount-hero-box ${remainingBalance < 0 ? 'insufficient' : ''}`}>
          <div className="amount-hero-top">
            <span className="field-label">Amount</span>
            {activeAccount && (
              <span className={`live-balance-pill ${remainingBalance < 0 ? 'over' : ''}`}>
                {activeAccount.name}: {money(activeAccount.balance)}
                {(Number(f.amount) || 0) > 0 && ` → ${money(remainingBalance)}`}
              </span>
            )}
          </div>
          <div className="amount-input">
            <span>{getCurrencySymbol()}</span>
            <input
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={f.amount || ''}
              onChange={e => {
                R('');
                F({ ...f, amount: +e.target.value });
              }}
              placeholder="0"
            />
            {(Number(f.amount) || 0) > 0 && (
              <button
                type="button"
                className="clear-amt-btn"
                onClick={() => F({ ...f, amount: 0 })}
                title="Clear amount"
              >
                Clear
              </button>
            )}
          </div>

          <div className="quick-amount-chips">
            {[50, 100, 200, 500, 1000].map(amt => (
              <button
                key={amt}
                type="button"
                className="amt-chip"
                onClick={() => {
                  R('');
                  F({ ...f, amount: roundCurrency((f.amount || 0) + amt) });
                }}
              >
                +{getCurrencySymbol()}
                {amt}
              </button>
            ))}
          </div>
        </div>

        {(!accounts.length || (repayment && !bankAcc)) && (
          <div className="no-account-hint">
            <b>{repayment ? 'Add a Bank Account first' : 'Create a Bank or Cash account first'}</b>
            <small>
              {repayment
                ? 'Repayments to your father are debited from your Bank Account.'
                : 'Choose where this amount will be deducted from.'}
            </small>
            <button type="button" className="secondary" onClick={onAddAccount}>
              <Plus size={16} /> Add account
            </button>
          </div>
        )}

        {/* Prominent Account / Payment Method Selector First */}
        {transfer ? (
          <div className="form-row">
            <label>
              Transfer from
              <select
                value={f.from}
                onChange={e => {
                  const nextFrom = e.target.value;
                  const nextTo =
                    f.to === nextFrom
                      ? accounts.find(a => a.id !== nextFrom)?.id || ''
                      : f.to;
                  F({ ...f, from: nextFrom, to: nextTo });
                }}
              >
                {accounts.map(a => (
                  <option value={a.id} key={a.id}>
                    {a.name} ({money(a.balance)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Transfer to
              <select value={f.to} onChange={e => F({ ...f, to: e.target.value })}>
                {accounts
                  .filter(a => a.id !== f.from)
                  .map(a => (
                    <option value={a.id} key={a.id}>
                      {a.name} ({money(a.balance)})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : repayment ? (
          accounts.filter(isBankAccount).length > 1 ? (
            <label>
              Debited from Bank Account (not an expense)
              <select value={f.from} onChange={e => F({ ...f, from: e.target.value })}>
                {accounts.filter(isBankAccount).map(a => (
                  <option value={a.id} key={a.id}>
                    {a.name} ({money(a.balance)})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="auto-account">
              <Landmark size={17} />
              <span>
                <small>DEBITED FROM BANK ACCOUNT (NOT AN EXPENSE)</small>
                <b>
                  {selectedAccount
                    ? `${selectedAccount.name} (${money(selectedAccount.balance)})`
                    : 'Bank Account'}
                </b>
              </span>
            </div>
          )
        ) : (
          <div className="payment-choice">
            <div className="field-label">Paid via Account</div>
            <div className="payment-options">
              {(['UPI', 'Cash'] as const).map(method => {
                const account = accountForPayment(method);
                return (
                  <button
                    type="button"
                    disabled={!account}
                    className={f.payment === method ? 'selected' : ''}
                    onClick={() => {
                      R('');
                      F({ ...f, payment: method, from: account?.id || f.from });
                    }}
                    key={method}
                  >
                    <span className="payment-symbol">{method === 'Cash' ? '₹' : '↗'}</span>
                    <span>
                      <b>{method === 'Cash' ? 'Cash Wallet' : 'Bank / UPI'}</b>
                      <small>
                        {account
                          ? `${account.name} (${money(account.balance)})`
                          : `Add a ${method === 'Cash' ? 'Cash' : 'Bank'} account`}
                      </small>
                    </span>
                    <span className="radio-dot" />
                  </button>
                );
              })}
            </div>
            {((f.payment === 'Cash' && cashAccounts.length > 1) ||
              (f.payment !== 'Cash' && bankAccounts.length > 1)) && (
              <label>
                Select {f.payment === 'Cash' ? 'Cash' : 'Bank'} account
                <select
                  value={f.from}
                  onChange={e => {
                    R('');
                    F({ ...f, from: e.target.value });
                  }}
                >
                  {(f.payment === 'Cash' ? cashAccounts : bankAccounts).map(a => (
                    <option value={a.id} key={a.id}>
                      {a.name} ({money(a.balance)})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {/* Bento Grid Category Picker for Expenses */}
        {f.type === 'Expense' && (
          <div className="category-section">
            <div className="field-label">Category</div>
            <div className="category-picker category-picker-grid">
              {expenseCategories.map(c => {
                const Icon = catIcons[c] || Receipt;
                return (
                  <button
                    type="button"
                    key={c}
                    className={f.category === c ? 'picked' : ''}
                    onClick={() => F({ ...f, category: c })}
                  >
                    <Icon size={17} />
                    <small>{c}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Description (Optional — defaults to category name if left empty) */}
        <label>
          <span>
            Description <span className="optional">(optional — defaults to {f.category})</span>
          </span>
          <input
            value={f.note}
            onChange={e => {
              R('');
              F({ ...f, note: e.target.value });
            }}
            placeholder={
              repayment
                ? 'e.g. Returned money to father'
                : transfer
                  ? 'e.g. Bank to Cash withdrawal'
                  : `e.g. ${noteSuggestions[0] || f.category}`
            }
          />
        </label>

        {/* Category-Aware Quick Note Suggestions */}
        <div className="note-suggestions">
          {noteSuggestions.map(s => (
            <button
              key={s}
              type="button"
              className={`suggestion-pill ${f.note === s ? 'active' : ''}`}
              onClick={() => F({ ...f, note: s })}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Date Input with Today / Yesterday Quick Chips */}
        <div className="date-shortcut-bar">
          <span className="field-label">Date & Time</span>
          <div className="date-quick-chips">
            <button
              type="button"
              className={`suggestion-pill ${f.date === todayStr ? 'active' : ''}`}
              onClick={() => F({ ...f, date: todayStr })}
            >
              Today
            </button>
            <button
              type="button"
              className={`suggestion-pill ${f.date === yesterdayStr ? 'active' : ''}`}
              onClick={() => F({ ...f, date: yesterdayStr })}
            >
              Yesterday
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>
            Date
            <input
              type="date"
              value={f.date}
              onChange={e => F({ ...f, date: e.target.value })}
            />
          </label>
          <label>
            Time <span className="optional">(optional)</span>
            <input
              type="time"
              value={f.time || ''}
              onChange={e => F({ ...f, time: e.target.value })}
            />
          </label>
        </div>

        {err && <p className="error">{err}</p>}

        <div className="dialog-footer">
          <button
            className="primary save-btn"
            disabled={
              !accounts.length ||
              (transfer && accounts.length < 2) ||
              (!transfer && !repayment && !accountForPayment(f.payment)) ||
              (repayment && !bankAcc) ||
              remainingBalance < 0
            }
          >
            <Check size={18} />{' '}
            {repayment
              ? 'Save repayment'
              : transfer
                ? 'Complete transfer'
                : (Number(f.amount) || 0) > 0
                  ? `Save ${money(f.amount)} expense`
                  : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatementDialog({
  initialMonth,
  accounts,
  opening,
  tx,
  userName,
  onClose
}: {
  initialMonth: string;
  accounts: A[];
  opening: Record<string, number>;
  tx: T[];
  userName: string;
  onClose: () => void;
}) {
  const now = new Date();
  const defaultMonth =
    initialMonth && /^\d{4}-\d{2}$/.test(initialMonth)
      ? initialMonth
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const monthStart = `${selectedMonth}-01`;
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });

  // Compute account balances at start of selectedMonth (before monthStart) and end of selectedMonth
  const txBeforeMonth = tx.filter(t => t.date < monthStart);
  const txUpToMonthEnd = tx.filter(t => t.date <= monthEnd);
  const txInMonth = tx
    .filter(t => t.date >= monthStart && t.date <= monthEnd)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  const openingAccounts = recalculateBalances(accounts, txBeforeMonth, opening);
  const closingAccounts = recalculateBalances(accounts, txUpToMonthEnd, opening);

  const openingTotal = roundCurrency(openingAccounts.reduce((s, a) => s + a.balance, 0));
  const closingTotal = roundCurrency(closingAccounts.reduce((s, a) => s + a.balance, 0));

  const monthExpenses = txInMonth.filter(t => t.type === 'Expense');
  const monthTransfers = txInMonth.filter(t => t.type === 'Transfer');
  const monthRepayments = txInMonth.filter(t => t.type === 'Repayment');

  const totalExpense = roundCurrency(monthExpenses.reduce((s, t) => s + t.amount, 0));
  const totalTransfer = roundCurrency(monthTransfers.reduce((s, t) => s + t.amount, 0));
  const totalRepaid = roundCurrency(monthRepayments.reduce((s, t) => s + t.amount, 0));

  const bankExpenses = roundCurrency(
    monthExpenses
      .filter(t => {
        const acc = accounts.find(a => a.id === t.from);
        return acc ? isBankAccount(acc) : t.payment !== 'Cash';
      })
      .reduce((s, t) => s + t.amount, 0)
  );
  const cashExpenses = roundCurrency(Math.max(0, totalExpense - bankExpenses));

  return (
    <div className="backdrop statement-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog statement-dialog">
        <div className="modalhead no-print">
          <div>
            <small className="label">SHAREABLE FATHER REPORT</small>
            <h2>Monthly PDF Statement</h2>
          </div>
          <div className="statement-head-actions">
            <input
              type="month"
              value={selectedMonth}
              onChange={e => e.target.value && setSelectedMonth(e.target.value)}
              className="month-picker-input"
              aria-label="Select statement month"
            />
            <button
              type="button"
              className="primary print-action-btn"
              onClick={() => window.print()}
            >
              <Printer size={16} /> Print / Save PDF
            </button>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Statement Sheet */}
        <div className="printable-statement" id="printable-statement">
          <div className="stmt-banner">
            <div>
              <small className="stmt-eyebrow">TG EXPENSE • MONTHLY ACCOUNT STATEMENT</small>
              <h3>{monthLabel}</h3>
              <p>Prepared by {userName} • Generated on {dateLabel(toLocalDateString())}</p>
            </div>
            <div className="stmt-live-badge">
              <span>Current Live Balance</span>
              <strong>{money(accounts.reduce((s, a) => s + a.balance, 0))}</strong>
            </div>
          </div>

          {/* 5-Step Flow Summary */}
          <div className="stmt-flow-grid">
            <div className="stmt-flow-card">
              <span>1. Opening Balance</span>
              <strong>{money(openingTotal)}</strong>
              <small>As of {dateLabel(monthStart)}</small>
            </div>
            <div className="stmt-flow-card expense">
              <span>2. Monthly Expenses</span>
              <strong>-{money(totalExpense)}</strong>
              <small>
                Bank: {money(bankExpenses)} • Cash: {money(cashExpenses)}
              </small>
            </div>
            <div className="stmt-flow-card transfer">
              <span>3. Bank ↔ Cash Transfers</span>
              <strong>{money(totalTransfer)}</strong>
              <small>{monthTransfers.length} internal transfer(s)</small>
            </div>
            <div className="stmt-flow-card repayment">
              <span>4. Repayments to Father</span>
              <strong>-{money(totalRepaid)}</strong>
              <small>{monthRepayments.length} return entry(s)</small>
            </div>
            <div className="stmt-flow-card closing">
              <span>5. Closing Balance</span>
              <strong>{money(closingTotal)}</strong>
              <small>As of {dateLabel(monthEnd)}</small>
            </div>
          </div>

          {/* Account-wise Breakdown */}
          <div className="stmt-section">
            <h4>Account Balance Summary</h4>
            <div className="stmt-table-wrap">
              <table className="stmt-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Opening ({dateLabel(monthStart)})</th>
                    <th>Closing ({dateLabel(monthEnd)})</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => {
                    const openAcc = openingAccounts.find(a => a.id === acc.id);
                    const closeAcc = closingAccounts.find(a => a.id === acc.id);
                    return (
                      <tr key={acc.id}>
                        <td><b>{acc.name}</b></td>
                        <td>{isCashAccount(acc) ? 'Cash Account' : 'Bank Account'}</td>
                        <td>{money(openAcc?.balance || 0)}</td>
                        <td><b>{money(closeAcc?.balance || 0)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Repayments & Bank <-> Cash Transfers Table */}
          {(monthRepayments.length > 0 || monthTransfers.length > 0) && (
            <div className="stmt-section">
              <h4>Repayments to Father & Bank ↔ Cash Transfers</h4>
              <div className="stmt-table-wrap">
                <table className="stmt-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Account Route</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthRepayments, ...monthTransfers].map(t => {
                      const fromName = accounts.find(a => a.id === t.from)?.name || 'Account';
                      const toName = accounts.find(a => a.id === t.to)?.name || 'Account';
                      return (
                        <tr key={t.id}>
                          <td>{dateLabel(t.date)}</td>
                          <td>
                            <span className={`stmt-badge ${t.type.toLowerCase()}`}>
                              {t.type === 'Repayment' ? 'Returned to Father' : 'Bank ↔ Cash'}
                            </span>
                          </td>
                          <td>{t.type === 'Transfer' ? `${fromName} → ${toName}` : fromName}</td>
                          <td>{t.note}</td>
                          <td className="num"><b>{money(t.amount)}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Itemized Expenses Table */}
          <div className="stmt-section">
            <h4>Itemized Monthly Expenses ({monthExpenses.length})</h4>
            {monthExpenses.length > 0 ? (
              <div className="stmt-table-wrap">
                <table className="stmt-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Paid Via</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthExpenses.map(t => {
                      const fromAcc = accounts.find(a => a.id === t.from);
                      return (
                        <tr key={t.id}>
                          <td>{dateLabel(t.date)}</td>
                          <td>{t.category}</td>
                          <td>{t.note}</td>
                          <td>{fromAcc ? fromAcc.name : t.payment || 'Account'}</td>
                          <td className="num"><b>-{money(t.amount)}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="stmt-empty">No expenses recorded in {monthLabel}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function analyticsData(rows: T[], accounts: A[], period: string, from = '', to = '') {
  const expensesOnly = rows.filter(t => t.type === 'Expense');

  const isCashTx = (t: T) => {
    const acc = accounts.find(a => a.id === t.from);
    if (acc) return isCashAccount(acc);
    return t.payment === 'Cash';
  };

  const sumPoint = (subset: T[]) => {
    const expense = roundCurrency(subset.reduce((s, t) => s + t.amount, 0));
    const cash = roundCurrency(subset.filter(isCashTx).reduce((s, t) => s + t.amount, 0));
    const bank = roundCurrency(Math.max(0, expense - cash));
    return { expense, bank, cash };
  };

  if (period === 'custom') {
    if (!from || !to || from > to) return [];
    const subset = expensesOnly.filter(t => t.date >= from && t.date <= to);
    const startD = new Date(from + 'T00:00:00');
    const endD = new Date(to + 'T00:00:00');
    const diffDays = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
    if (diffDays <= 31) {
      return Array.from({ length: diffDays }, (_, i) => {
        const d = new Date(startD);
        d.setDate(d.getDate() + i);
        const keyStr = toLocalDateString(d);
        const dayRows = subset.filter(t => t.date === keyStr);
        return {
          month: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          ...sumPoint(dayRows)
        };
      });
    }
    return [
      {
        month: `${dateLabel(from)} – ${dateLabel(to)}`,
        ...sumPoint(subset)
      }
    ];
  }

  const now = new Date();
  const count = period === 'daily' ? 7 : period === 'weekly' ? 8 : period === 'yearly' ? 5 : 6;
  const starts: Date[] = [];

  for (let i = count - 1; i >= 0; i--) {
    let x: Date;
    if (period === 'daily') {
      x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    } else if (period === 'weekly') {
      x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * i);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    } else if (period === 'yearly') {
      x = new Date(now.getFullYear() - i, 0, 1);
    } else {
      x = new Date(now.getFullYear(), now.getMonth() - i, 1);
    }
    x.setHours(0, 0, 0, 0);
    starts.push(x);
  }

  return starts.map((start, i) => {
    const end = new Date(start);
    if (period === 'daily') end.setDate(end.getDate() + 1);
    else if (period === 'weekly') end.setDate(end.getDate() + 7);
    else if (period === 'yearly') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    const current = expensesOnly.filter(t => {
      const date = new Date(t.date + 'T12:00:00');
      return date >= start && date < end;
    });

    return {
      month:
        period === 'daily'
          ? start.toLocaleDateString('en-IN', { weekday: 'short' })
          : period === 'weekly'
            ? 'W' + (i + 1)
            : period === 'yearly'
              ? String(start.getFullYear())
              : start.toLocaleDateString('en-IN', { month: 'short' }),
      ...sumPoint(current)
    };
  });
}

function AccountDialog({
  initial,
  accounts,
  currentBalance,
  onSelectAccount,
  onClose,
  onSave
}: {
  initial: A | null;
  accounts: A[];
  currentBalance: number;
  onSelectAccount: (a: A | null) => void;
  onClose: () => void;
  onSave: (a: A, targetCurrentBalance: number) => void;
}) {
  const [id] = useState(initial?.id || uid());
  const [name, N] = useState(initial?.name || '');
  const [type, Tp] = useState(
    initial ? (isCashAccount(initial) ? 'Cash Account' : 'Bank Account') : 'Bank Account'
  );
  const [mode, M] = useState<'set' | 'add'>(initial ? 'add' : 'set');
  const [amountInput, B] = useState(initial ? '' : String(currentBalance));
  const [color, C] = useState(initial?.color || '#647be8');
  const [error, E] = useState('');
  const types = ['Bank Account', 'Cash Account'];

  const computedBalance =
    initial && mode === 'add'
      ? currentBalance + (Number(amountInput) || 0)
      : Number(amountInput);

  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog account-dialog"
        onSubmit={e => {
          e.preventDefault();
          if (!name.trim()) {
            E('Enter an account name.');
            return;
          }
          if (!Number.isFinite(computedBalance) || computedBalance < 0) {
            E('Resulting balance must be zero or more.');
            return;
          }
          onSave({ id, name: name.trim(), type, balance: computedBalance, color }, computedBalance);
        }}
      >
        <div className="modalhead">
          <div>
            <small className="label">BANK & CASH BALANCE</small>
            <h2>{initial ? `Update ${initial.name}` : 'Add account'}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Account switcher when multiple accounts exist */}
        {accounts.length > 0 && (
          <div className="type-filter-strip account-switcher-strip">
            {accounts.map(acc => (
              <button
                type="button"
                key={acc.id}
                className={initial?.id === acc.id ? 'filter-chip active' : 'filter-chip'}
                onClick={() => onSelectAccount(acc)}
              >
                {acc.name} ({money(acc.balance)})
              </button>
            ))}
            {accounts.length < 2 && initial && (
              <button
                type="button"
                className="filter-chip"
                onClick={() => onSelectAccount(null)}
              >
                + New Account
              </button>
            )}
          </div>
        )}

        <label>
          Account name
          <input
            autoFocus={!initial && typeof window !== 'undefined' && window.innerWidth >= 768}
            value={name}
            onChange={e => {
              E('');
              N(e.target.value);
            }}
            placeholder="e.g. Bank Account, Cash Wallet"
          />
        </label>

        <div className="field-label account-type-label">Account type</div>
        <div className="account-type-options">
          {types.map(x => (
            <button
              type="button"
              className={type === x ? 'selected' : ''}
              onClick={() => Tp(x)}
              key={x}
            >
              <span>{x === 'Cash Account' ? <Wallet size={19} /> : <Landmark size={19} />}</span>
              <b>{x}</b>
              <small>{x === 'Cash Account' ? 'Physical cash' : 'UPI and bank payments'}</small>
            </button>
          ))}
        </div>

        {initial && (
          <div className="tabs">
            <button
              type="button"
              className={mode === 'add' ? 'chosen' : ''}
              onClick={() => {
                M('add');
                B('');
              }}
            >
              + Add Funds from Father
            </button>
            <button
              type="button"
              className={mode === 'set' ? 'chosen' : ''}
              onClick={() => {
                M('set');
                B(String(currentBalance));
              }}
            >
              Set Exact Balance
            </button>
          </div>
        )}

        <label>
          {initial
            ? mode === 'add'
              ? `Amount to add (Current: ${money(currentBalance)} → New: ${money(Math.max(0, computedBalance))})`
              : 'New current balance'
            : 'Current balance'}
          <input
            autoFocus={Boolean(initial) && typeof window !== 'undefined' && window.innerWidth >= 768}
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={initial && mode === 'add' ? 'e.g. 5000' : '0'}
            value={amountInput}
            onChange={e => B(e.target.value)}
          />
        </label>

        {initial && mode === 'add' && (
          <div className="quick-amount-chips">
            {[500, 1000, 2000, 5000].map(amt => (
              <button
                key={amt}
                type="button"
                className="amt-chip"
                onClick={() => B(String((Number(amountInput) || 0) + amt))}
              >
                +{getCurrencySymbol()}
                {amt}
              </button>
            ))}
          </div>
        )}

        <div className="field-label">Account color</div>
        <div className="color-options">
          {['#647be8', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e'].map(
            x => (
              <button
                type="button"
                aria-label={'Set color ' + x}
                className={color === x ? 'chosen' : ''}
                style={{ background: x }}
                onClick={() => C(x)}
                key={x}
              />
            )
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="dialog-footer">
          <button className="save-btn">
            <Check size={18} />
            {initial ? 'Update balance' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  );
}

function download(data: string, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([data], { type: name.endsWith('.csv') ? 'text/csv' : 'application/json' })
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default App;
