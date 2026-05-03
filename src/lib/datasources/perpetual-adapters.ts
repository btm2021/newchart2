import { CcxtExchangeAdapter } from "@/lib/datasources/ccxt-exchange-adapter";

export class OkxPerpetualAdapter extends CcxtExchangeAdapter {
  constructor() {
    super("OKX_PERP", "OKX Perpetual", "futures", {
      ccxtId: "okx",
      defaultType: "swap",
      labelSuffix: "Perpetual",
      swapOnly: true,
    });
  }
}
