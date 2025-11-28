import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArenaAccountMeta,
  ArenaModelChatEntry,
  ArenaPositionsAccount,
  ArenaTrade,
  getArenaModelChat,
  getArenaPositions,
  getArenaTrades,
  getAccounts,
} from '@/lib/api'
import { useArenaData } from '@/contexts/ArenaDataContext'
import { useTradingMode } from '@/contexts/TradingModeContext'
import { Button } from '@/components/ui/button'
import { TradingCard } from '@/components/ui/TradingCard'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getModelLogo } from './logoAssets'
import HighlightWrapper from './HighlightWrapper'
import { formatDateTime } from '@/lib/dateTime'

interface AlphaArenaFeedProps {
  refreshKey?: number
  autoRefreshInterval?: number
  wsRef?: React.MutableRefObject<WebSocket | null>
  selectedAccount?: number | 'all'
  onSelectedAccountChange?: (accountId: number | 'all') => void
  walletAddress?: string
}

type FeedTab = 'trades' | 'model-chat' | 'positions'

const DEFAULT_LIMIT = 100
const MODEL_CHAT_LIMIT = 60

type CacheKey = string

// Use formatDateTime from @/lib/dateTime with 'short' style for compact display
const formatDate = (value?: string | null) => formatDateTime(value, { style: 'short' })

function formatPercent(value?: number | null) {
  if (value === undefined || value === null) return 'â€”'
  return `${(value * 100).toFixed(2)}%`
}

function renderSymbolBadge(symbol?: string, size: 'sm' | 'md' = 'md') {
  if (!symbol) return null
  const text = symbol.slice(0, 4).toUpperCase()
  const baseClasses = 'inline-flex items-center justify-center rounded bg-muted text-muted-foreground font-semibold'
  const sizeClasses = size === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]'
  return <span className={`${baseClasses} ${sizeClasses}`}>{text}</span>
}


export default function AlphaArenaFeed({
  refreshKey,
  autoRefreshInterval = 60_000,
  wsRef,
  selectedAccount: selectedAccountProp,
  onSelectedAccountChange,
  walletAddress,
}: AlphaArenaFeedProps) {
  const { getData, updateData } = useArenaData()
  const { tradingMode } = useTradingMode()
  const [activeTab, setActiveTab] = useState<FeedTab>('trades')
  const [allTraderOptions, setAllTraderOptions] = useState<ArenaAccountMeta[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [internalSelectedAccount, setInternalSelectedAccount] = useState<number | 'all'>(
    selectedAccountProp ?? 'all',
  )
  const [expandedChat, setExpandedChat] = useState<number | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [copiedSections, setCopiedSections] = useState<Record<string, boolean>>({})
  const [manualRefreshKey, setManualRefreshKey] = useState(0)
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [loadingModelChat, setLoadingModelChat] = useState(false)
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [trades, setTrades] = useState<ArenaTrade[]>([])
  const [modelChat, setModelChat] = useState<ArenaModelChatEntry[]>([])
  const [positions, setPositions] = useState<ArenaPositionsAccount[]>([])
  const [accountsMeta, setAccountsMeta] = useState<ArenaAccountMeta[]>([])

  // Track seen items for highlight animation
  const seenTradeIds = useRef<Set<number>>(new Set())
  const seenDecisionIds = useRef<Set<number>>(new Set())
  const prevManualRefreshKey = useRef(manualRefreshKey)
  const prevRefreshKey = useRef(refreshKey)
  const prevTradingMode = useRef(tradingMode)

  // Sync external account selection with internal state
  useEffect(() => {
    if (selectedAccountProp !== undefined) {
      setInternalSelectedAccount(selectedAccountProp)
    }
  }, [selectedAccountProp])

  // Compute active account and cache key
  const activeAccount = useMemo(() => selectedAccountProp ?? internalSelectedAccount, [selectedAccountProp, internalSelectedAccount])
  const prevActiveAccount = useRef<number | 'all'>(activeAccount)
  const cacheKey: CacheKey = useMemo(() => {
    const accountKey = activeAccount === 'all' ? 'all' : String(activeAccount)
    const walletKey = walletAddress ? walletAddress.toLowerCase() : 'nowallet'
    return `${accountKey}_${tradingMode}_${walletKey}`
  }, [activeAccount, tradingMode, walletAddress])

  // Initialize from global state on mount or account change
  useEffect(() => {
    const globalData = getData(cacheKey)
    if (globalData) {
      setTrades(globalData.trades)
      setModelChat(globalData.modelChat)
      setPositions(globalData.positions)
      setAccountsMeta(globalData.accountsMeta)
      setLoadingTrades(false)
      setLoadingModelChat(false)
      setLoadingPositions(false)
    }
  }, [cacheKey, getData])

  const writeCache = useCallback(
    (key: CacheKey, data: Partial<{ trades: ArenaTrade[]; modelChat: ArenaModelChatEntry[]; positions: ArenaPositionsAccount[] }>) => {
      updateData(key, data)
    },
    [updateData],
  )

  // Listen for real-time WebSocket updates
  useEffect(() => {
    if (!wsRef?.current) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)

        // Filter by trading mode/environment first
        const msgEnvironment = msg.trade?.environment || msg.decision?.environment || msg.trading_mode
        if (msgEnvironment && msgEnvironment !== tradingMode) {
          // Ignore messages from different trading environments
          return
        }

        // Only process messages for the active account or all accounts
        const msgAccountId = msg.trade?.account_id || msg.decision?.account_id
        const shouldProcess = activeAccount === 'all' || !msgAccountId || msgAccountId === activeAccount

        if (!shouldProcess) return

        const messageWallet: string | undefined =
          msg.trade?.wallet_address || msg.decision?.wallet_address || undefined
        if (walletAddress) {
          if (!messageWallet) return
          if (messageWallet.toLowerCase() !== walletAddress.toLowerCase()) return
        }

        if (msg.type === 'trade_update' && msg.trade) {
          // Prepend new trade to the list
          setTrades((prev) => {
            // Check if trade already exists to prevent duplicates
            const exists = prev.some((t) => t.trade_id === msg.trade.trade_id)
            if (exists) return prev
            const next = [msg.trade, ...prev].slice(0, DEFAULT_LIMIT)
            writeCache(cacheKey, { trades: next })
            return next
          })
        }

        if (msg.type === 'position_update' && msg.positions) {
          // Update positions for the relevant account
          setPositions((prev) => {
            // If no account_id specified in message, this is a full update for one account
            const accountId = msg.positions[0]?.account_id
            if (!accountId) return msg.positions

            // Replace positions for this specific account
            const otherAccounts = prev.filter((acc) => acc.account_id !== accountId)
            // Find if we have position data in the message
            const newAccountPositions = msg.positions.filter((p: any) => p.account_id === accountId)

            if (newAccountPositions.length > 0) {
              // Construct account snapshot from positions
              const previousMeta = prev.find((acc) => acc.account_id === accountId)
              const accountSnapshot = {
                account_id: accountId,
                account_name: previousMeta?.account_name || '',
                environment: previousMeta?.environment || null,
                available_cash: 0, // Will be updated by next snapshot
                used_margin: previousMeta?.used_margin ?? 0,
                positions_value: previousMeta?.positions_value ?? 0,
                total_unrealized_pnl: 0,
                total_assets: previousMeta?.total_assets ?? 0,
                initial_capital: previousMeta?.initial_capital ?? 0,
                total_return: previousMeta?.total_return ?? null,
                margin_usage_percent: previousMeta?.margin_usage_percent ?? null,
                margin_mode: previousMeta?.margin_mode ?? null,
                positions: newAccountPositions,
              }
              const next = [...otherAccounts, accountSnapshot]
              writeCache(cacheKey, { positions: next })
              return next
            }

            return prev
          })
        }

        if (msg.type === 'model_chat_update' && msg.decision) {
          // Prepend new AI decision to the list
          setModelChat((prev) => {
            // Check if decision already exists to prevent duplicates
            const exists = prev.some((entry) => entry.id === msg.decision.id)
            if (exists) return prev
            const next = [msg.decision, ...prev].slice(0, MODEL_CHAT_LIMIT)
            writeCache(cacheKey, { modelChat: next })
            return next
          })
        }
      } catch (err) {
        console.error('Failed to parse AlphaArenaFeed WebSocket message:', err)
      }
    }

    wsRef.current.addEventListener('message', handleMessage)

    return () => {
      wsRef.current?.removeEventListener('message', handleMessage)
    }
  }, [wsRef, activeAccount, cacheKey, walletAddress, writeCache])

  // Load accounts for dropdown - use dedicated API instead of positions data
  const loadAccounts = useCallback(async () => {
    try {
      setLoadingAccounts(true)
      const accounts = await getAccounts()
      const accountMetas = accounts.map(acc => ({
        account_id: acc.id,
        name: acc.name,
        model: acc.model ?? null,
      }))
      setAllTraderOptions(accountMetas)
    } catch (err) {
      console.error('[AlphaArenaFeed] Failed to load accounts:', err)
    } finally {
      setLoadingAccounts(false)
    }
  }, [])

  // Load accounts immediately on mount
  useEffect(() => {
    if (allTraderOptions.length === 0 && !loadingAccounts) {
      loadAccounts()
    }
  }, [])

  // Individual loaders for each data type
  const loadTradesData = useCallback(async () => {
    try {
      setLoadingTrades(true)
      const accountId = activeAccount === 'all' ? undefined : activeAccount
      const tradeRes = await getArenaTrades({
        limit: DEFAULT_LIMIT,
        account_id: accountId,
        trading_mode: tradingMode,
        wallet_address: walletAddress,
      })
      const newTrades = tradeRes.trades || []
      setTrades(newTrades)
      updateData(cacheKey, { trades: newTrades })

      // Extract metadata from trades
      if (tradeRes.accounts) {
        const metas = tradeRes.accounts
        setAccountsMeta(prev => {
          const metaMap = new Map(prev.map(m => [m.account_id, m]))
          metas.forEach(m => metaMap.set(m.account_id, m))
          return Array.from(metaMap.values())
        })
        updateData(cacheKey, { accountsMeta: Array.from(new Map(tradeRes.accounts.map(m => [m.account_id, m])).values()) })
      }

      setLoadingTrades(false)
      return tradeRes
    } catch (err) {
      console.error('[AlphaArenaFeed] Failed to load trades:', err)
      setLoadingTrades(false)
      return null
    }
  }, [activeAccount, cacheKey, updateData, tradingMode, walletAddress])

  const loadModelChatData = useCallback(async () => {
    try {
      setLoadingModelChat(true)
      const accountId = activeAccount === 'all' ? undefined : activeAccount
      const chatRes = await getArenaModelChat({
        limit: MODEL_CHAT_LIMIT,
        account_id: accountId,
        trading_mode: tradingMode,
        wallet_address: walletAddress,
      })
      const newModelChat = chatRes.entries || []
      setModelChat(newModelChat)
      updateData(cacheKey, { modelChat: newModelChat })

      // Extract metadata from modelchat
      if (chatRes.entries && chatRes.entries.length > 0) {
        const metas = chatRes.entries.map(entry => ({
          account_id: entry.account_id,
          name: entry.account_name,
          model: entry.model ?? null,
        }))
        setAccountsMeta(prev => {
          const metaMap = new Map(prev.map(m => [m.account_id, m]))
          metas.forEach(m => metaMap.set(m.account_id, m))
          return Array.from(metaMap.values())
        })
      }

      setLoadingModelChat(false)
      return chatRes
    } catch (err) {
      console.error('[AlphaArenaFeed] Failed to load model chat:', err)
      setLoadingModelChat(false)
      return null
    }
  }, [activeAccount, cacheKey, updateData, tradingMode, walletAddress])

  const loadPositionsData = useCallback(async () => {
    try {
      setLoadingPositions(true)
      const accountId = activeAccount === 'all' ? undefined : activeAccount
      const positionRes = await getArenaPositions({ account_id: accountId, trading_mode: tradingMode })
      const newPositions = positionRes.accounts || []
      setPositions(newPositions)
      updateData(cacheKey, { positions: newPositions })

      // Extract metadata from positions
      if (positionRes.accounts) {
        const metas = positionRes.accounts.map(account => ({
          account_id: account.account_id,
          name: account.account_name,
          model: account.model ?? null,
        }))
        setAccountsMeta(prev => {
          const metaMap = new Map(prev.map(m => [m.account_id, m]))
          metas.forEach(m => metaMap.set(m.account_id, m))
          return Array.from(metaMap.values())
        })
        updateData(cacheKey, { accountsMeta: Array.from(new Map(metas.map(m => [m.account_id, m])).values()) })
      }

      setLoadingPositions(false)
      return positionRes
    } catch (err) {
      console.error('[AlphaArenaFeed] Failed to load positions:', err)
      setLoadingPositions(false)
      return null
    }
  }, [activeAccount, cacheKey, updateData, tradingMode])

  // Lazy load data when tab becomes active
  useEffect(() => {
    const cached = getData(cacheKey)

    if (activeTab === 'trades' && trades.length === 0 && !loadingTrades) {
      if (cached?.trades && cached.trades.length > 0) {
        setTrades(cached.trades)
      } else {
        loadTradesData()
      }
    }

    if (activeTab === 'model-chat' && modelChat.length === 0 && !loadingModelChat) {
      if (cached?.modelChat && cached.modelChat.length > 0) {
        setModelChat(cached.modelChat)
      } else {
        loadModelChatData()
      }
    }

    if (activeTab === 'positions' && positions.length === 0 && !loadingPositions) {
      if (cached?.positions && cached.positions.length > 0) {
        setPositions(cached.positions)
      } else {
        loadPositionsData()
      }
    }
  }, [activeTab, cacheKey])

  // Background polling - refresh all data regardless of active tab
  useEffect(() => {
    if (autoRefreshInterval <= 0) return

    const pollAllData = async () => {
      // Load all three APIs in background, independent of active tab
      await Promise.allSettled([
        loadTradesData(),
        loadModelChatData(),
        loadPositionsData()
      ])
    }

    const intervalId = setInterval(pollAllData, autoRefreshInterval)

    return () => clearInterval(intervalId)
  }, [autoRefreshInterval, loadTradesData, loadModelChatData, loadPositionsData])

  // Manual refresh trigger handler
  useEffect(() => {
    const shouldForce =
      manualRefreshKey !== prevManualRefreshKey.current ||
      refreshKey !== prevRefreshKey.current

    if (shouldForce) {
      prevManualRefreshKey.current = manualRefreshKey
      prevRefreshKey.current = refreshKey

      // Force refresh all data
      Promise.allSettled([
        loadTradesData(),
        loadModelChatData(),
        loadPositionsData()
      ])
    }
  }, [manualRefreshKey, refreshKey, loadTradesData, loadModelChatData, loadPositionsData])

  // Reload data when account filter changes
  useEffect(() => {
    // Skip initial mount
    if (prevActiveAccount.current !== activeAccount) {
      prevActiveAccount.current = activeAccount

      // Reload all data with new account filter
      Promise.allSettled([
        loadTradesData(),
        loadModelChatData(),
        loadPositionsData()
      ])
    }
  }, [activeAccount, loadTradesData, loadModelChatData, loadPositionsData])

  const accountOptions = useMemo(() => {
    return allTraderOptions.sort((a, b) => a.name.localeCompare(b.name))
  }, [allTraderOptions])

  const handleRefreshClick = () => {
    setManualRefreshKey((key) => key + 1)
  }

  const handleAccountFilterChange = (value: number | 'all') => {
    if (selectedAccountProp === undefined) {
      setInternalSelectedAccount(value)
    }
    onSelectedAccountChange?.(value)
    setExpandedChat(null)
    setExpandedSections({})

    // Data reload will be triggered by useEffect when activeAccount updates
  }

  const toggleSection = (entryId: number, section: 'prompt' | 'reasoning' | 'decision') => {
    const key = `${entryId}-${section}`
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const isSectionExpanded = (entryId: number, section: 'prompt' | 'reasoning' | 'decision') =>
    !!expandedSections[`${entryId}-${section}`]

  const handleCopySection = async (entryId: number, section: 'prompt' | 'reasoning' | 'decision', content: string) => {
    const key = `${entryId}-${section}`
    try {
      await navigator.clipboard.writeText(content)
      setCopiedSections((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopiedSections((prev) => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const isSectionCopied = (entryId: number, section: 'prompt' | 'reasoning' | 'decision') =>
    !!copiedSections[`${entryId}-${section}`]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter</span>
          <select
            value={activeAccount === 'all' ? '' : activeAccount}
            onChange={(e) => {
              const value = e.target.value
              handleAccountFilterChange(value ? Number(value) : 'all')
            }}
            className="h-8 rounded border border-border bg-muted px-2 text-xs uppercase tracking-wide text-foreground"
          >
            <option value="">All Traders</option>
            {accountOptions.map((meta) => (
              <option key={meta.account_id} value={meta.account_id}>
                {meta.name}{meta.model ? ` (${meta.model})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Showing last {DEFAULT_LIMIT} trades</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRefreshClick} disabled={loadingTrades || loadingModelChat || loadingPositions}>
            Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value: FeedTab) => setActiveTab(value)}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="grid grid-cols-3 gap-0 border border-border bg-muted text-foreground">
          <TabsTrigger value="trades" className="data-[state=active]:bg-background data-[state=active]:text-foreground border-r border-border text-[10px] md:text-xs">
            COMPLETED TRADES
          </TabsTrigger>
          <TabsTrigger value="model-chat" className="data-[state=active]:bg-background data-[state=active]:text-foreground border-r border-border text-[10px] md:text-xs">
            MODELCHAT
          </TabsTrigger>
          <TabsTrigger value="positions" className="data-[state=active]:bg-background data-[state=active]:text-foreground text-[10px] md:text-xs">
            POSITIONS
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 border border-t-0 border-border bg-card min-h-0 flex flex-col overflow-hidden">
          {error && (
            <div className="p-4 text-sm text-loss-500 bg-loss-500/10 border-b border-loss-500/20">
              {error}
            </div>
          )}

          {!error && (
            <>
              <TabsContent value="trades" className="flex-1 h-0 overflow-y-auto mt-0 p-4 space-y-4">
                {loadingTrades && trades.length === 0 ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                  </div>
                ) : trades.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">No recent trades found.</div>
                ) : (
                  trades.map((trade) => {
                    const modelLogo = getModelLogo(trade.account_name || trade.model)
                    const isNew = !seenTradeIds.current.has(trade.trade_id)
                    if (!seenTradeIds.current.has(trade.trade_id)) {
                      seenTradeIds.current.add(trade.trade_id)
                    }
                    return (
                      <HighlightWrapper key={`${trade.trade_id}-${trade.trade_time}`} isNew={isNew}>
                        <TradingCard className="p-4 space-y-3 bg-oracle-800/40 border-white/5 hover:border-electric-500/30 transition-all duration-300">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-white/5 pb-2">
                            <div className="flex items-center gap-2">
                              {modelLogo && (
                                <img
                                  src={modelLogo.src}
                                  alt={modelLogo.alt}
                                  className="h-5 w-5 rounded-full object-contain bg-white/5 p-0.5"
                                  loading="lazy"
                                />
                              )}
                              <span className="font-semibold text-white">{trade.account_name}</span>
                            </div>
                            <span>{formatDate(trade.trade_time)}</span>
                          </div>
                          <div className="text-sm text-white flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-electric-500">{trade.account_name}</span>
                            <span>completed a</span>
                            <Badge variant="outline" className={`px-2 py-0.5 text-xs font-bold border-0 ${
                              trade.side === 'BUY'
                                ? 'bg-profit-500/20 text-profit-500'
                                : trade.side === 'CLOSE'
                                ? 'bg-neutral-500/20 text-neutral-500'
                                : 'bg-loss-500/20 text-loss-500'
                            }`}>
                              {trade.side}
                            </Badge>
                            <span>trade on</span>
                            <span className="flex items-center gap-2 font-semibold font-mono">
                              {renderSymbolBadge(trade.symbol)}
                              {trade.symbol}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground pt-1">
                            <div>
                              <span className="block text-[10px] uppercase tracking-wide mb-0.5">Price</span>
                              <span className="font-medium font-numeric text-white">
                                <AnimatedNumber value={trade.price} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase tracking-wide mb-0.5">Quantity</span>
                              <span className="font-medium font-numeric text-white">
                                <AnimatedNumber value={trade.quantity} format={(v) => v.toFixed(4)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase tracking-wide mb-0.5">Notional</span>
                              <span className="font-medium font-numeric text-white">
                                <AnimatedNumber value={trade.notional} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase tracking-wide mb-0.5">Commission</span>
                              <span className="font-medium font-numeric text-white">
                                <AnimatedNumber value={trade.commission} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                          </div>
                        </TradingCard>
                      </HighlightWrapper>
                    )
                  })
                )}
              </TabsContent>

              <TabsContent value="model-chat" className="flex-1 h-0 overflow-y-auto mt-0 p-4 space-y-3">
                {loadingModelChat && modelChat.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Loading model chatâ€¦</div>
                ) : modelChat.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No recent AI commentary.</div>
                ) : (
                  modelChat.map((entry) => {
                    const isExpanded = expandedChat === entry.id
                    const modelLogo = getModelLogo(entry.account_name || entry.model)
                    const isNew = !seenDecisionIds.current.has(entry.id)
                    if (!seenDecisionIds.current.has(entry.id)) {
                      seenDecisionIds.current.add(entry.id)
                    }

                    return (
                      <HighlightWrapper key={entry.id} isNew={isNew}>
                        <TradingCard className="p-0 bg-oracle-800/40 border-white/5 hover:border-electric-500/30 transition-all duration-300">
                          <button
                            type="button"
                            className="w-full text-left p-4 space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500 focus-visible:ring-offset-2 rounded-xl"
                            onClick={() =>
                              setExpandedChat((current) => {
                                const next = current === entry.id ? null : entry.id
                                if (current === entry.id) {
                                  setExpandedSections((prev) => {
                                    const nextState = { ...prev }
                                    Object.keys(nextState).forEach((key) => {
                                      if (key.startsWith(`${entry.id}-`)) {
                                        delete nextState[key]
                                      }
                                    })
                                    return nextState
                                  })
                                }
                                return next
                              })
                            }
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-white/5 pb-2">
                              <div className="flex items-center gap-2">
                                {modelLogo && (
                                  <img
                                    src={modelLogo.src}
                                    alt={modelLogo.alt}
                                    className="h-5 w-5 rounded-full object-contain bg-white/5 p-0.5"
                                    loading="lazy"
                                  />
                                )}
                                <span className="font-semibold text-white">{entry.account_name}</span>
                              </div>
                              <span>{formatDate(entry.decision_time)}</span>
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                              <Badge variant="outline" className="border-electric-500/50 text-electric-500">
                                {(entry.operation || 'UNKNOWN').toUpperCase()}
                              </Badge>
                              {entry.symbol && (
                                <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                                  {renderSymbolBadge(entry.symbol, 'sm')}
                                  {entry.symbol}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground leading-relaxed">
                              {isExpanded ? entry.reason : `${entry.reason.slice(0, 160)}${entry.reason.length > 160 ? 'â€¦' : ''}`}
                            </div>
                            {isExpanded && (
                              <div className="space-y-2 pt-3">
                                {[{
                                  label: 'USER_PROMPT' as const,
                                  section: 'prompt' as const,
                                  content: entry.prompt_snapshot,
                                  empty: 'No prompt available',
                                }, {
                                  label: 'CHAIN_OF_THOUGHT' as const,
                                  section: 'reasoning' as const,
                                  content: entry.reasoning_snapshot,
                                  empty: 'No reasoning available',
                                }, {
                                  label: 'TRADING_DECISIONS' as const,
                                  section: 'decision' as const,
                                  content: entry.decision_snapshot,
                                  empty: 'No decision payload available',
                                }].map(({ label, section, content, empty }) => {
                                  const open = isSectionExpanded(entry.id, section)
                                  const displayContent = content?.trim()
                                  const copied = isSectionCopied(entry.id, section)

                                  return (
                                    <div key={section} className="border border-white/5 rounded-md bg-black/20">
                                      <button
                                        type="button"
                                        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-white transition-colors"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          toggleSection(entry.id, section)
                                        }}
                                      >
                                        <span className="flex items-center gap-2">
                                          <span className="text-xs">{open ? 'â–¼' : 'â–¶'}</span>
                                          {label.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/80">{open ? 'Hide details' : 'Show details'}</span>
                                      </button>
                                      {open && (
                                        <div
                                          className="border-t border-white/5 bg-black/40 px-3 py-3 text-xs text-muted-foreground"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          {displayContent ? (
                                            <>
                                              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-white/80">
                                                {displayContent}
                                              </pre>
                                              <div className="mt-3 flex justify-end">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (displayContent) {
                                                      handleCopySection(entry.id, section, displayContent)
                                                    }
                                                  }}
                                                  className={`px-3 py-1.5 text-[10px] font-medium rounded transition-all ${copied
                                                      ? 'bg-profit-500/20 text-profit-500 border border-profit-500/30'
                                                      : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white border border-white/10'
                                                    }`}
                                                >
                                                  {copied ? 'âœ“ Copied' : 'Copy'}
                                                </button>
                                              </div>
                                            </>

                                          ) : (
                                            <span className="text-muted-foreground/70">{empty}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground uppercase tracking-wide pt-2 border-t border-white/5">
                              <span>Prev Portion: <span className="font-semibold text-white">{(entry.prev_portion * 100).toFixed(1)}%</span></span>
                              <span>Target Portion: <span className="font-semibold text-white">{(entry.target_portion * 100).toFixed(1)}%</span></span>
                              <span>Total Balance: <span className="font-semibold text-white">
                                <AnimatedNumber value={entry.total_balance} prefix="$" format={(v) => v.toFixed(2)} />
                              </span></span>
                              <span>Executed: <span className={`font-semibold ${entry.executed ? 'text-profit-500' : 'text-neutral-500'}`}>{entry.executed ? 'YES' : 'NO'}</span></span>
                            </div>
                            <div className="mt-2 text-[11px] text-electric-500 underline opacity-50 hover:opacity-100 transition-opacity">
                              {isExpanded ? 'Click to collapse' : 'Click to expand'}
                            </div>
                          </button>
                        </TradingCard>
                      </HighlightWrapper>
                    )
                  })
                )}
              </TabsContent>

              <TabsContent value="positions" className="flex-1 h-0 overflow-y-auto mt-0 p-4 space-y-4">
                {loadingPositions && positions.length === 0 ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-48 w-full rounded-xl" />
                    ))}
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">No active positions currently.</div>
                ) : (
                  positions.map((snapshot) => {
                    const marginUsageClass =
                      snapshot.margin_usage_percent !== undefined && snapshot.margin_usage_percent !== null
                        ? snapshot.margin_usage_percent >= 75
                          ? 'text-loss-500'
                          : snapshot.margin_usage_percent >= 50
                            ? 'text-warning-500'
                            : 'text-profit-500'
                        : 'text-muted-foreground'
                    return (
                      <TradingCard key={snapshot.account_id} className="p-0 bg-oracle-800/40 border-white/5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3 bg-white/5">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-semibold uppercase tracking-wide text-white">
                              {snapshot.account_name}
                            </div>
                            {snapshot.environment && (
                              <Badge variant="outline" className="border-white/10 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {snapshot.environment}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-wide text-muted-foreground">
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Total Equity</span>
                              <span className="font-semibold font-numeric text-white">
                                <AnimatedNumber value={snapshot.total_assets} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Available Cash</span>
                              <span className="font-semibold font-numeric text-white">
                                <AnimatedNumber value={snapshot.available_cash} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Used Margin</span>
                              <span className="font-semibold font-numeric text-white">
                                <AnimatedNumber value={snapshot.used_margin ?? 0} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Margin Usage</span>
                              <span className={`font-semibold font-numeric ${marginUsageClass}`}>
                                {snapshot.margin_usage_percent !== undefined && snapshot.margin_usage_percent !== null
                                  ? `${snapshot.margin_usage_percent.toFixed(2)}%`
                                  : 'â€”'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Unrealized P&L</span>
                              <span className={`font-semibold font-numeric ${snapshot.total_unrealized_pnl >= 0 ? 'text-profit-500' : 'text-loss-500'}`}>
                                <AnimatedNumber value={snapshot.total_unrealized_pnl} prefix="$" format={(v) => v.toFixed(2)} />
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground mb-0.5">Total Return</span>
                              <span className={`font-semibold font-numeric ${snapshot.total_return && snapshot.total_return >= 0 ? 'text-profit-500' : 'text-loss-500'}`}>
                                {formatPercent(snapshot.total_return)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[980px] divide-y divide-white/5">
                            <thead className="bg-black/20">
                              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                <th className="px-4 py-2 text-left font-medium">Side</th>
                                <th className="px-4 py-2 text-left font-medium">Coin</th>
                                <th className="px-4 py-2 text-left font-medium">Size</th>
                                <th className="px-4 py-2 text-left font-medium">Entry / Current</th>
                                <th className="px-4 py-2 text-left font-medium">Leverage</th>
                                <th className="px-4 py-2 text-left font-medium">Margin Used</th>
                                <th className="px-4 py-2 text-left font-medium">Notional</th>
                                <th className="px-4 py-2 text-left font-medium">Current Value</th>
                                <th className="px-4 py-2 text-left font-medium">Unreal P&L</th>
                                <th className="px-4 py-2 text-left font-medium">Portfolio %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-xs text-muted-foreground">
                              {snapshot.positions.map((position, idx) => {
                                const leverageLabel =
                                  position.leverage && position.leverage > 0
                                    ? `${position.leverage.toFixed(2)}x`
                                    : 'â€”'
                                const marginUsed = position.margin_used ?? 0
                                const roePercent =
                                  position.return_on_equity !== undefined && position.return_on_equity !== null
                                    ? position.return_on_equity * 100
                                    : null
                                const portfolioPercent =
                                  position.percentage !== undefined && position.percentage !== null
                                    ? position.percentage * 100
                                    : null
                                const unrealizedDecimals =
                                  Math.abs(position.unrealized_pnl) < 1 ? 4 : 2
                                return (
                                  <tr key={`${position.symbol}-${idx}`} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-2 font-semibold text-white">
                                      <Badge variant="outline" className={`border-0 px-1.5 py-0 ${
                                        position.side === 'LONG' ? 'bg-profit-500/20 text-profit-500' : 'bg-loss-500/20 text-loss-500'
                                      }`}>
                                        {position.side}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2 font-semibold text-white font-mono">
                                        {renderSymbolBadge(position.symbol, 'sm')}
                                        {position.symbol}
                                      </div>
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{position.market}</div>
                                    </td>
                                    <td className="px-4 py-2 font-numeric">
                                      <AnimatedNumber value={position.quantity} format={(v) => v.toFixed(4)} />
                                    </td>
                                    <td className="px-4 py-2 font-numeric">
                                      <div className="text-white font-semibold">
                                        <AnimatedNumber value={position.avg_cost} prefix="$" format={(v) => v.toFixed(2)} />
                                      </div>
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <AnimatedNumber value={position.current_price} prefix="$" format={(v) => v.toFixed(2)} />
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 font-numeric">{leverageLabel}</td>
                                    <td className="px-4 py-2 font-numeric">
                                      <AnimatedNumber value={marginUsed} prefix="$" format={(v) => v.toFixed(2)} />
                                    </td>
                                    <td className="px-4 py-2 font-numeric">
                                      <AnimatedNumber value={position.notional} prefix="$" format={(v) => v.toFixed(2)} />
                                    </td>
                                    <td className="px-4 py-2 font-numeric">
                                      <AnimatedNumber value={position.current_value} prefix="$" format={(v) => v.toFixed(2)} />
                                    </td>
                                    <td className={`px-4 py-2 font-semibold font-numeric ${position.unrealized_pnl >= 0 ? 'text-profit-500' : 'text-loss-500'}`}>
                                      <div>
                                        <AnimatedNumber value={position.unrealized_pnl} prefix="$" format={(v) => v.toFixed(unrealizedDecimals)} />
                                      </div>
                                      {roePercent !== null && (
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                          {roePercent.toFixed(2)}%
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 font-numeric">
                                      {portfolioPercent !== null ? `${portfolioPercent.toFixed(2)}%` : 'â€”'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </TradingCard>
                    )
                  })
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}
