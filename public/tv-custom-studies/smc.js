function createSMC(PineJS) {
    return {
        name: "SMC",
        metainfo: {
            _metainfoVersion: 51,
            id: "smc@tv-basicstudies-1",
            name: "SMC",
            description: "Smart Money Concepts [Simplified]",
            shortDescription: "SMC",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: "plot_open", type: "ohlc_open", target: "plot_candle" },
                { id: "plot_high", type: "ohlc_high", target: "plot_candle" },
                { id: "plot_low", type: "ohlc_low", target: "plot_candle" },
                { id: "plot_close", type: "ohlc_close", target: "plot_candle" },
                { id: "plot_bar_color", type: "ohlc_colorer", palette: "palette_bar", target: "plot_candle" },
                { id: "plot_wick_color", type: "wick_colorer", palette: "palette_wick", target: "plot_candle" },
                { id: "plot_border_color", type: "border_colorer", palette: "palette_border", target: "plot_candle" },
                { id: "plot_internal_high", type: "line" },
                { id: "plot_internal_low", type: "line" }
            ],

            palettes: {
                palette_bar: {
                    colors: [{ name: "Bearish" }, { name: "Bullish" }],
                    valToIndex: { 0: 0, 1: 1 }
                },
                palette_wick: {
                    colors: [{ name: "Bearish" }, { name: "Bullish" }],
                    valToIndex: { 0: 0, 1: 1 }
                },
                palette_border: {
                    colors: [{ name: "Bearish" }, { name: "Bullish" }],
                    valToIndex: { 0: 0, 1: 1 }
                }
            },

            ohlcPlots: {
                plot_candle: { title: "SMC Candles" }
            },

            defaults: {
                ohlcPlots: {
                    plot_candle: {
                        borderColor: "#000000",
                        color: "#000000",
                        drawBorder: true,
                        drawWick: true,
                        plottype: "ohlc_candles",
                        visible: true,
                        wickColor: "#000000"
                    }
                },
                palettes: {
                    palette_bar: {
                        colors: [
                            { color: "#F23645", width: 1, style: 0 }, // Bearish RED
                            { color: "#089981", width: 1, style: 0 }  // Bullish GREEN
                        ]
                    },
                    palette_wick: {
                        colors: [{ color: "#F23645" }, { color: "#089981" }]
                    },
                    palette_border: {
                        colors: [{ color: "#F23645" }, { color: "#089981" }]
                    }
                },
                styles: {
                    plot_internal_high: { visible: false, color: "#F23645", linewidth: 1, linestyle: 2 },
                    plot_internal_low: { visible: false, color: "#089981", linewidth: 1, linestyle: 2 }
                },
                inputs: {
                    internalLength: 5,
                    showInternal: true
                }
            },

            inputs: [
                { id: "internalLength", name: "Internal Length", defval: 5, type: "integer", min: 2 },
                { id: "showInternal", name: "Show Internal BOS/CHoCH", defval: true, type: "bool" }
            ],

            styles: {
                plot_internal_high: { title: "Internal High Level" },
                plot_internal_low: { title: "Internal Low Level" }
            },

            precision: 4,
            format: { type: "price", precision: 4 }
        },

        constructor: function () {
            this.init = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Structure States
                this.internalTrend = 0;

                this.internalHigh = { level: NaN, crossed: false };
                this.internalLow = { level: NaN, crossed: false };

                // Buffers for pivots
                this.internalLeg = NaN;

                this.pricesHigh = [];
                this.pricesLow = [];
                this.barIndex = 0;
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const internalLen = this._input(0);
                const showInternal = this._input(1);

                const open = PineJS.Std.open(this._context);
                const high = PineJS.Std.high(this._context);
                const low = PineJS.Std.low(this._context);
                const close = PineJS.Std.close(this._context);

                if (isNaN(close)) return [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];

                this.pricesHigh.push(high);
                this.pricesLow.push(low);
                if (this.pricesHigh.length > 50) { // arbitrary buffer enough for internal logic
                    this.pricesHigh.shift();
                    this.pricesLow.shift();
                }

                // 1. Detect Internal Structure (Smaller Window)
                if (this.pricesHigh.length >= internalLen + 1) {
                    const idx = this.pricesHigh.length - 1 - internalLen;
                    const priceHi = this.pricesHigh[idx];
                    const priceLi = this.pricesLow[idx];

                    const internalHighs = this.pricesHigh.slice(-internalLen);
                    const internalLows = this.pricesLow.slice(-internalLen);

                    const highestI = Math.max(...internalHighs);
                    const lowestI = Math.min(...internalLows);

                    let newInternalLeg = this.internalLeg;
                    if (priceHi > highestI) newInternalLeg = 0;
                    else if (priceLi < lowestI) newInternalLeg = 1;

                    if (newInternalLeg !== this.internalLeg && !isNaN(this.internalLeg)) {
                        if (newInternalLeg === 1) { // Low Detected
                            this.internalLow = { level: priceLi, crossed: false };
                        } else { // High Detected
                            this.internalHigh = { level: priceHi, crossed: false };
                        }
                    }
                    this.internalLeg = newInternalLeg;
                }

                // 4. Check for CHOCHO/BOS - Internal
                if (showInternal) {
                    if (!isNaN(this.internalHigh.level) && !this.internalHigh.crossed && close > this.internalHigh.level) {
                        this.internalHigh.crossed = true;
                        const label = this.internalTrend === -1 ? "CHoCH" : "BOS";
                        this.internalTrend = 1;
                        this.createSMCLabel(label, 1, 0); // type 0: internal
                    }
                    if (!isNaN(this.internalLow.level) && !this.internalLow.crossed && close < this.internalLow.level) {
                        this.internalLow.crossed = true;
                        const label = this.internalTrend === 1 ? "CHoCH" : "BOS";
                        this.internalTrend = -1;
                        this.createSMCLabel(label, -1, 0);
                    }
                }

                // Candle coloring based on internal trend
                const trendIdx = this.internalTrend === -1 ? 0 : 1;

                this.barIndex++;
                return [
                    open, high, low, close, trendIdx, trendIdx, trendIdx,
                    this.internalHigh.level, this.internalLow.level
                ];
            };

            this.createSMCLabel = function (text, bias, type) {
                const color = bias === 1 ? "#089981" : "#F23645";
                const style = bias === 1 ? 1 /* up */ : 0 /* down */;
                const prefix = type === 1 ? "S-" : "i-";
                const fontSize = type === 1 ? 10 : 8;

                // Note: Actual labels need to be created via TradingView's API if available in this context,
                // but since we are in a custom study main function, we might need to use plots or a different approach for labels.
                // For now, let's use console log and handle it with plot annotations if we were using the old system.
                // However, TV custom studies can use 'this._context.new_label' if supported.

                try {
                    const price = bias === 1 ? PineJS.Std.high(this._context) : PineJS.Std.low(this._context);
                    const labelStyle = bias === 1 ? "label_style_down" : "label_style_up"; // reverse since signal is on break
                    // Actually BOS/CHoCH labels are usually centered on the break candle.

                    // In many TV implementations, we can't easily draw labels from this.main.
                    // Instead, we will use plot shapes or similar.
                    console.log(`[SMC] ${prefix}${text} detected at ${price}`);
                } catch (e) { }
            };
        }
    };
}
