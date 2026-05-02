// VIDYA (Variable Index Dynamic Average) Custom Study
// A dynamic moving average that adjusts smoothing based on market volatility

function createVIDYA(PineJS) {
    return {
        name: "VIDYA",
        metainfo: {
            _metainfoVersion: 51,
            id: "vidya@tv-basicstudies-1",
            name: "VIDYA",
            description: "Variable Index Dynamic Average",
            shortDescription: "VIDYA",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: "plot_0", type: "line" }
            ],

            defaults: {
                styles: {
                    plot_0: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 2, // Line
                        trackPrice: true,
                        transparency: 0,
                        visible: true,
                        color: "#2196F3"
                    }
                },
                inputs: {
                    length: 20,
                    cmo_length: 9,
                    source: "close"
                }
            },

            inputs: [
                {
                    id: "length",
                    name: "Length",
                    defval: 20,
                    type: "integer",
                    min: 1,
                    max: 500
                },
                {
                    id: "cmo_length",
                    name: "CMO Length",
                    defval: 9,
                    type: "integer",
                    min: 1,
                    max: 100
                },
                {
                    id: "source",
                    name: "Source",
                    defval: "close",
                    type: "source"
                }
            ],

            styles: {
                plot_0: {
                    title: "VIDYA",
                    histogramBase: 0,
                    joinPoints: true
                }
            },

            precision: 4,
            format: {
                type: "price",
                precision: 4
            }
        },

        constructor: function () {
            this.init = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // VIDYA state
                this.prev_vidya = NaN;

                // CMO calculation arrays
                this.gains = [];
                this.losses = [];
                this.prev_close = NaN;

                // First bar flag
                this.is_first_bar = true;
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Get input values
                const length = this._input(0);
                const cmo_length = this._input(1);
                const source_type = this._input(2);

                // Get source price
                let source;
                switch (source_type) {
                    case "open":
                        source = PineJS.Std.open(this._context);
                        break;
                    case "high":
                        source = PineJS.Std.high(this._context);
                        break;
                    case "low":
                        source = PineJS.Std.low(this._context);
                        break;
                    case "close":
                    default:
                        source = PineJS.Std.close(this._context);
                        break;
                    case "hl2":
                        source = (PineJS.Std.high(this._context) + PineJS.Std.low(this._context)) / 2;
                        break;
                    case "hlc3":
                        source = (PineJS.Std.high(this._context) + PineJS.Std.low(this._context) + PineJS.Std.close(this._context)) / 3;
                        break;
                    case "ohlc4":
                        source = (PineJS.Std.open(this._context) + PineJS.Std.high(this._context) + PineJS.Std.low(this._context) + PineJS.Std.close(this._context)) / 4;
                        break;
                }

                if (isNaN(source)) {
                    return [NaN];
                }

                // Initialize VIDYA on first bar
                if (this.is_first_bar) {
                    this.prev_vidya = source;
                    this.prev_close = source;
                    this.is_first_bar = false;
                    return [source];
                }

                // Calculate price change for CMO
                const change = source - this.prev_close;

                // Separate gains and losses
                if (change > 0) {
                    this.gains.push(change);
                    this.losses.push(0);
                } else if (change < 0) {
                    this.gains.push(0);
                    this.losses.push(Math.abs(change));
                } else {
                    this.gains.push(0);
                    this.losses.push(0);
                }

                // Maintain array length
                if (this.gains.length > cmo_length) {
                    this.gains.shift();
                    this.losses.shift();
                }

                // Calculate CMO (Chande Momentum Oscillator)
                let cmo = 0;
                if (this.gains.length >= cmo_length) {
                    const sum_gains = this.gains.reduce((a, b) => a + b, 0);
                    const sum_losses = this.losses.reduce((a, b) => a + b, 0);
                    const sum_total = sum_gains + sum_losses;

                    if (sum_total !== 0) {
                        cmo = ((sum_gains - sum_losses) / sum_total) * 100;
                    }
                }

                // Calculate alpha (smoothing factor)
                // Standard EMA alpha adjusted by CMO
                const ema_alpha = 2 / (length + 1);
                const abs_cmo = Math.abs(cmo);
                const alpha = ema_alpha * (abs_cmo / 100);

                // Calculate VIDYA
                let vidya;
                if (isNaN(this.prev_vidya)) {
                    vidya = source;
                } else {
                    vidya = alpha * source + (1 - alpha) * this.prev_vidya;
                }

                // Update state
                this.prev_vidya = vidya;
                this.prev_close = source;

                return [vidya];
            };
        }
    };
}
