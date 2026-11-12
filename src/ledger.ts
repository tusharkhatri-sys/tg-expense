export type LedgerAccount = { id: string; balance: number; type?: string };
export type LedgerTransaction = { id: string; type: string; amount: number; from: string; to?: string };

const roundCurrency = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function recalculateBalances<A extends LedgerAccount>(accounts: A[], transactions: LedgerTransaction[], opening: Record<string, number>): A[] {
  return accounts.map(account => {
    const delta = transactions.reduce((sum, transaction) => {
      if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) return sum;
      // Repayments and own-account transfers reduce the source balance but are not expenses.
      const source = transaction.from === account.id ? (transaction.type === 'Income' || transaction.type === 'Received' ? transaction.amount : -transaction.amount) : 0;
      const movesBetweenAccounts = transaction.type === 'Transfer' || transaction.type === 'Cash Withdrawal' || transaction.type === 'Cash Deposit';
      const destination = movesBetweenAccounts && transaction.to === account.id ? transaction.amount : 0;
      return roundCurrency(sum + source + destination);
    }, 0);
    const baseBalance = opening[account.id] ?? account.balance;
    return { ...account, balance: roundCurrency(baseBalance + delta) };
  });
}

