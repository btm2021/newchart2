import { CcxtExchangeAdapter } from "@/lib/datasources/ccxt-exchange-adapter";

export class BinanceSpotAdapter extends CcxtExchangeAdapter {
  constructor() {
    super("BINANCE_SPOT", "Binance Spot", "spot", {
      ccxtId: "binance",
      defaultType: "spot",
      labelSuffix: "Spot",
      blacklistPatterns: [/BULL/i, /BEAR/i, /UP/i, /DOWN/i],
    });
  }
}

export class BinanceFuturesAdapter extends CcxtExchangeAdapter {
  constructor() {
    super("BINANCE_FUTURES", "Binance Futures", "futures", {
      ccxtId: "binance",
      defaultType: "future",
      labelSuffix: "Perpetual",
      swapOnly: true,
      blacklistPatterns: [/BULL/i, /BEAR/i, /UP/i, /DOWN/i, /DEFI/i],
    });
  }
}
