import type { OrderId, TradeId } from '@jet/shared';

export interface IdGen {
  nextOrderId(): OrderId;
  nextTradeId(): TradeId;
}

export function makeIdGen(start = 1): IdGen {
  let o = start;
  let t = start;
  return {
    nextOrderId: () => `o-${o++}` as OrderId,
    nextTradeId: () => `t-${t++}` as TradeId,
  };
}
