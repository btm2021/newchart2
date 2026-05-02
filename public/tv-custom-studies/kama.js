function createKAMA(PineJS) {
    return {
        name: "KAMA",
        metainfo: {
            _metainfoVersion: 51,
            id: "kama@tv-basicstudies-1",
            name: "KAMA",
            description: "Kaufman's Adaptive Moving Average",
            shortDescription: "KAMA",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [{ id: "plot_0", type: "line" }],

            defaults: {
                styles: {
                    plot_0: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#2196F3"
                    }
                },
                inputs: {
                    length: 10,
                    fastLength: 2,
                    slowLength: 30
                }
            },

            inputs: [
                {
                    id: "length",
                    name: "Period",
                    defval: 10,
                    type: "integer",
                    min: 1
                },
                {
                    id: "fastLength",
                    name: "Fast EMA Period",
                    defval: 2,
                    type: "integer",
                    min: 1
                },
                {
                    id: "slowLength",
                    name: "Slow EMA Period",
                    defval: 30,
                    type: "integer",
                    min: 1
                }
            ],

            styles: {
                plot_0: {
                    title: "KAMA",
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
                this._kama = NaN;
                this._prices = [];
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const length = this._input(0);
                const fastLength = this._input(1);
                const slowLength = this._input(2);

                const price = PineJS.Std.close(this._context);
                if (isNaN(price)) return [NaN];

                this._prices.push(price);
                if (this._prices.length > length + 1) {
                    this._prices.shift();
                }

                if (this._prices.length < length + 1) {
                    return [NaN];
                }

                // Efficiency Ratio (ER)
                const change = Math.abs(price - this._prices[0]);
                let volatility = 0;
                for (let i = 1; i < this._prices.length; i++) {
                    volatility += Math.abs(this._prices[i] - this._prices[i - 1]);
                }

                const er = volatility === 0 ? 0 : change / volatility;

                // Smoothing Constant (SC)
                const fastSC = 2 / (fastLength + 1);
                const slowSC = 2 / (slowLength + 1);
                const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);

                // KAMA
                if (isNaN(this._kama)) {
                    this._kama = price;
                } else {
                    this._kama = this._kama + sc * (price - this._kama);
                }

                return [this._kama];
            };
        }
    };
}
