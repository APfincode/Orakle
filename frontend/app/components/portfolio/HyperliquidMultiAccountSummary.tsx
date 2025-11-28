import { useEffect, useState, useMemo, useCallback } from 'react'
import { TradingCard } from '@/components/ui/TradingCard'
import { Badge } from '@/components/ui/badge'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, AlertTriangle, Wallet } from 'lucide-react'
import { getHyperliquidBalance } from '@/lib/hyperliquidApi'
import { getModelLogo } from './logoAssets'
import type { HyperliquidEnvironment } from '@/lib/types/hyperliquid'
import type { HyperliquidBalance } from '@/lib/types/hyperliquid'
import { useTradingMode } from '@/contexts/TradingModeContext'
import { formatDateTime } from '@/lib/dateTime'

interface AccountBalance {
  accountId: number
  accountName: string
  balance: HyperliquidBalance | null
  error: string | null
  loading: boolean
}

interface HyperliquidMultiAccountSummaryProps {
  accounts: Array<{ account_id: number; account_name: string }>
  refreshKey?: number
  selectedAccount?: number | 'all'
}

const getMarginStatus = (percent: number) => {
  if (percent < 50) {
    return {
      color: 'bg-profit-500',
      text: 'Healthy',
      icon: TrendingUp,
      textColor: 'text-profit-500',
      dotColor: 'bg-profit-500',
    } as const
  }
  if (percent < 75) {
    return {
      color: 'bg-neutral-500',
      text: 'Moderate',
      icon: AlertTriangle,
      textColor: 'text-neutral-500',
      dotColor: 'bg-neutral-500',
    } as const
  }
  return {
    color: 'bg-loss-500',
    text: 'High Risk',
    icon: AlertTriangle,
    textColor: 'text-loss-500',
    dotColor: 'bg-loss-500',
  } as const
}

export default function HyperliquidMultiAccountSummary({
  accounts,
  refreshKey,
  selectedAccount = 'all',
}: HyperliquidMultiAccountSummaryProps) {
  const { tradingMode } = useTradingMode()
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([])
  const [globalLastUpdate, setGlobalLastUpdate] = useState<string | null>(null)

  // Filter accounts based on selectedAccount - memoized to prevent infinite loops
  const filteredAccounts = useMemo(() => {
    return selectedAccount === 'all'
      ? accounts
      : accounts.filter(acc => acc.account_id === selectedAccount)
  }, [accounts, selectedAccount])

  // Load all account balances in parallel - memoized to prevent infinite loops
  const loadAllBalances = useCallback(async () => {
    const results = await Promise.allSettled(
      filteredAccounts.map(async (acc) => {
        try {
          const balance = await getHyperliquidBalance(acc.account_id)
          return {
            accountId: acc.account_id,
            accountName: acc.account_name,
            balance,
            error: null,
            loading: false,
          }
        } catch (error: any) {
          console.error(`Failed to load balance for account ${acc.account_id}:`, error)
          return {
            accountId: acc.account_id,
            accountName: acc.account_name,
            balance: null,
            error: error.message || 'Failed to load',
            loading: false,
          }
        }
      })
    )

    const newBalances: AccountBalance[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        return {
          accountId: filteredAccounts[index].account_id,
          accountName: filteredAccounts[index].account_name,
          balance: null,
          error: 'Failed to load',
          loading: false,
        }
      }
    })

    setAccountBalances(newBalances)

    // Find the most recent update timestamp across all accounts
    const latestUpdate = newBalances
      .map((acc) => acc.balance?.lastUpdated)
      .filter((ts): ts is string => ts !== undefined)
      .sort()
      .reverse()[0]

    if (latestUpdate) {
      setGlobalLastUpdate(formatDateTime(latestUpdate))
    }
  }, [filteredAccounts])

  useEffect(() => {
    if (filteredAccounts.length === 0) {
      setAccountBalances([])
      return
    }

    // Only initialize with loading state on first load (when accountBalances is empty)
    const isFirstLoad = accountBalances.length === 0
    if (isFirstLoad) {
      setAccountBalances(
        filteredAccounts.map((acc) => ({
          accountId: acc.account_id,
          accountName: acc.account_name,
          balance: null,
          error: null,
          loading: true,
        }))
      )
    }

    loadAllBalances()
  }, [filteredAccounts, tradingMode, refreshKey])

  if (tradingMode !== 'testnet' && tradingMode !== 'mainnet') {
    return null
  }

  if (filteredAccounts.length === 0) {
    return (
      <TradingCard className="p-6">
        <div className="text-sm text-muted-foreground">
          No Hyperliquid accounts configured
        </div>
      </TradingCard>
    )
  }

  const environment: HyperliquidEnvironment =
    tradingMode === 'testnet' || tradingMode === 'mainnet' ? tradingMode : 'testnet'

  const isLoading = accountBalances.some((acc) => acc.loading)

  // Dynamic grid columns based on number of accounts
  const accountCount = accountBalances.length
  const gridColsClass = accountCount === 1
    ? 'grid-cols-1'
    : accountCount === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : accountCount === 3
        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Account Status</h2>
          {globalLastUpdate && (
            <span className="text-xs text-muted-foreground">
              Updated: {globalLastUpdate}
            </span>
          )}
        </div>
        <Badge
          variant="outline"
          className={`uppercase text-xs border-opacity-50 ${environment === 'testnet'
              ? 'border-electric-500 text-electric-500'
              : 'border-profit-500 text-profit-500'
            }`}
        >
          {environment}
        </Badge>
      </div>

      {/* Account cards grid */}
      <div className={`grid ${gridColsClass} gap-4`}>
        {accountBalances.map((account) => {
          const logo = getModelLogo(account.accountName)
          const marginStatus = account.balance
            ? getMarginStatus(account.balance.marginUsagePercent)
            : null
          const StatusIcon = marginStatus?.icon

          if (account.loading && !account.balance) {
            return <Skeleton key={account.accountId} className="h-[200px] w-full rounded-xl" />
          }

          return (
            <TradingCard
              key={account.accountId}
              className="p-5 space-y-4 bg-oracle-800/40 border-white/5 hover:border-electric-500/30 transition-all duration-300"
            >
              {/* Account header with logo */}
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                  {logo ? (
                    <img
                      src={logo.src}
                      alt={logo.alt}
                      className="h-8 w-8 rounded-full object-contain bg-white/5 p-1"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-electric-500/20 flex items-center justify-center">
                      <Wallet className="h-4 w-4 text-electric-500" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm text-white truncate max-w-[120px]">
                      {account.accountName}
                    </div>
                    {account.balance?.walletAddress && (
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {account.balance.walletAddress.slice(0, 4)}...
                        {account.balance.walletAddress.slice(-4)}
                      </div>
                    )}
                  </div>
                </div>
                {marginStatus && (
                  <div className={`h-2 w-2 rounded-full ${marginStatus.dotColor} shadow-[0_0_8px_currentColor] ${marginStatus.textColor}`} />
                )}
              </div>

              {/* Error state */}
              {account.error && (
                <div className="text-xs text-loss-500 bg-loss-500/10 p-2 rounded">
                  {account.error}
                </div>
              )}

              {/* Balance data */}
              {account.balance && (
                <div className="space-y-4">
                  {/* Total Equity */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total Equity</div>
                    <div className="text-2xl font-bold font-numeric text-white tracking-tight">
                      <AnimatedNumber
                        value={account.balance.totalEquity}
                        prefix="$"
                        format={(v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Used Margin */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Used Margin</div>
                      <div className="text-sm font-medium font-numeric text-white/90">
                        <AnimatedNumber
                          value={account.balance.usedMargin}
                          prefix="$"
                          format={(v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        />
                      </div>
                    </div>

                    {/* Margin Usage */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Usage</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium font-numeric ${marginStatus?.textColor}`}>
                          {account.balance.marginUsagePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TradingCard>
          )
        })}
      </div>
    </div>
  )
}