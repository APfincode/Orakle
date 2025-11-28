/**
 * HyperliquidView - Hyperliquid Trading Mode Main View
 *
 * ARCHITECTURE:
 * - This component is the ACTIVE container for Hyperliquid mode (testnet/mainnet)
 * - Uses HyperliquidAssetChart for asset curve visualization with multi-account support
 * - Uses HyperliquidMultiAccountSummary for multi-account summary display
 * - Uses AlphaArenaFeed for real-time trading feed
 *
 * DO NOT CONFUSE WITH:
 * - ComprehensiveView: Legacy paper trading component (deprecated, kept for reference)
 * - AssetCurveWithData: Paper mode chart component (NOT used here)
 *
 * CURRENT STATUS: Active production component for multi-wallet Hyperliquid architecture
 */
import React, { useState, useEffect } from 'react'
import { useTradingMode } from '@/contexts/TradingModeContext'
import { getArenaPositions } from '@/lib/api'
import AlphaArenaFeed from '@/components/portfolio/AlphaArenaFeed'
import HyperliquidMultiAccountSummary from '@/components/portfolio/HyperliquidMultiAccountSummary'
import HyperliquidAssetChart from './HyperliquidAssetChart'

interface HyperliquidViewProps {
  wsRef?: React.MutableRefObject<WebSocket | null>
  refreshKey?: number
}

import { TradingCard } from '@/components/ui/TradingCard'
import { Skeleton } from '@/components/ui/skeleton'

export default function HyperliquidView({ wsRef, refreshKey = 0 }: HyperliquidViewProps) {
  const { tradingMode } = useTradingMode()
  const [loading, setLoading] = useState(true)
  const [positionsData, setPositionsData] = useState<any>(null)
  const [chartRefreshKey, setChartRefreshKey] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<number | 'all'>('all')
  const environment = tradingMode === 'testnet' || tradingMode === 'mainnet' ? tradingMode : undefined

  // Load data from APIs
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const positions = await getArenaPositions({ trading_mode: tradingMode })
        setPositionsData(positions)
      } catch (error) {
        console.error('Failed to load Hyperliquid data:', error)
      } finally {
        setChartRefreshKey(prev => prev + 1)
        setLoading(false)
      }
    }

    loadData()
  }, [tradingMode, refreshKey])

  // Extract account list for multi-account summary
  const accounts = positionsData?.accounts?.map((acc: any) => ({
    account_id: acc.account_id,
    account_name: acc.account_name,
  })) || []

  const firstAccountId = accounts[0]?.account_id

  if (loading && !positionsData) {
    return (
      <div className="grid gap-6 grid-cols-5 h-full min-h-0 p-6">
        <div className="col-span-3 flex flex-col gap-4">
          <Skeleton className="h-[320px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
        <div className="col-span-2">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-5 h-full min-h-0 p-6">
      {/* Left Panel - Chart & Account Summary */}
      <div className="col-span-1 lg:col-span-3 flex flex-col gap-6 min-h-0">
        <div className="flex-1 min-h-[320px]">
          {positionsData?.accounts?.length > 0 ? (
            <TradingCard className="h-full p-1 bg-oracle-900/40">
              <HyperliquidAssetChart
                accountId={firstAccountId}
                refreshTrigger={chartRefreshKey}
                environment={environment}
                selectedAccount={selectedAccount}
              />
            </TradingCard>
          ) : (
            <TradingCard className="h-full flex items-center justify-center">
              <div className="text-muted-foreground">No Hyperliquid account configured</div>
            </TradingCard>
          )}
        </div>
        <TradingCard className="p-0 overflow-hidden">
          <HyperliquidMultiAccountSummary
            accounts={accounts}
            refreshKey={refreshKey + chartRefreshKey}
            selectedAccount={selectedAccount}
          />
        </TradingCard>
      </div>

      {/* Right Panel - Feed */}
      <div className="col-span-1 lg:col-span-2 flex flex-col min-h-0">
        <TradingCard className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden bg-oracle-900/60">
          <AlphaArenaFeed
            wsRef={wsRef}
            selectedAccount={selectedAccount}
            onSelectedAccountChange={setSelectedAccount}
          />
        </TradingCard>
      </div>
    </div>
  )
}
