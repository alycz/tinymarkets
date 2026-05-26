import { useState } from 'react';
import type { CSSProperties } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
import type { OrderBookSnapshot, Trade } from '@jet/shared';
import { C, S } from '../theme.js';
import { OrderBookPanelBody } from './OrderBookPanel.js';
import { TradesFeedBody } from './TradesFeed.js';

type BookLevel = OrderBookSnapshot['bids'][number];
type Tab = 'book' | 'trades';

interface Props {
  snapshot: OrderBookSnapshot | null;
  trades: Trade[];
  onSelectLevel: (level: BookLevel, side: 'bid' | 'ask') => void;
}

export default function BookTradesPanel({ snapshot, trades, onSelectLevel }: Props) {
  const [tab, setTab] = useState<Tab>('book');
  return (
    <Tabs.Root value={tab} onValueChange={(value) => setTab(value as Tab)} style={rootStyle}>
      <Tabs.List style={tabsStyle}>
        <UnderlineTab value="book" active={tab === 'book'}>
          Order Book
        </UnderlineTab>
        <UnderlineTab value="trades" active={tab === 'trades'}>
          Trades
        </UnderlineTab>
      </Tabs.List>
      <Tabs.Content value="book" asChild>
        <motion.div
          style={bodyStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <OrderBookPanelBody snapshot={snapshot} onSelectLevel={onSelectLevel} />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="trades" asChild>
        <motion.div
          style={bodyStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <TradesFeedBody trades={trades} />
        </motion.div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

function UnderlineTab({
  value,
  active,
  children,
}: {
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      style={{
        ...tabButtonStyle,
        color: active ? C.text : C.textMute,
        borderBottomColor: active ? C.accent : 'transparent',
      }}
    >
      {children}
    </Tabs.Trigger>
  );
}

const rootStyle: CSSProperties = {
  background: C.panel,
  borderBottom: `1px solid ${C.border}`,
  overflow: 'hidden',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const tabsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 0,
  padding: 0,
  background: C.panelSoft,
  borderBottom: `1px solid ${C.border}`,
  height: 64,
};

const tabButtonStyle: CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  transition: 'color 120ms ease, border-color 120ms ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const bodyStyle: CSSProperties = {
  padding: S.sm,
  minHeight: 0,
  flex: 1,
  overflow: 'auto',
  outline: 'none',
};
