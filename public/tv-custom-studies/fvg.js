function createFVG(PineJS) {
    const MAX_FVGS = 10; // Number of concurrent FVGs allowed (Bull/Bear each)

    // Dynamically generate plots and filled areas
    const plots = [];
    const filledAreas = [];
    const styles = {};
    const filledAreasStyle = {};

    for (let i = 0; i < MAX_FVGS; i++) {
        // Bullish plots
        plots.push({ id: `plot_bull_top_${i}`, type: "line" });
        plots.push({ id: `plot_bull_bottom_${i}`, type: "line" });
        styles[`plot_bull_top_${i}`] = { title: `Bull Top ${i + 1}` };
        styles[`plot_bull_bottom_${i}`] = { title: `Bull Bottom ${i + 1}` };

        // Bearish plots
        plots.push({ id: `plot_bear_top_${i}`, type: "line" });
        plots.push({ id: `plot_bear_bottom_${i}`, type: "line" });
        styles[`plot_bear_top_${i}`] = { title: `Bear Top ${i + 1}` };
        styles[`plot_bear_bottom_${i}`] = { title: `Bear Bottom ${i + 1}` };

        // Bullish filled area
        filledAreas.push({
            id: `fillarea_bull_${i}`,
            objAId: `plot_bull_top_${i}`,
            objBId: `plot_bull_bottom_${i}`,
            type: "plot_plot",
            title: `Bullish FVG Zone ${i + 1}`
        });

        // Bearish filled area
        filledAreas.push({
            id: `fillarea_bear_${i}`,
            objAId: `plot_bear_top_${i}`,
            objBId: `plot_bear_bottom_${i}`,
            type: "plot_plot",
            title: `Bearish FVG Zone ${i + 1}`
        });
    }

    const defaults = {
        styles: {},
        filledAreasStyle: {},
        inputs: {
            minThreshold: 0.5,
            checkThreeCandles: true
        }
    };

    for (let i = 0; i < MAX_FVGS; i++) {
        defaults.styles[`plot_bull_top_${i}`] = { visible: true, color: "rgba(85, 229, 80, 0)", linewidth: 1, linestyle: 0 };
        defaults.styles[`plot_bull_bottom_${i}`] = { visible: true, color: "rgba(85, 229, 80, 0)", linewidth: 1, linestyle: 0 };
        defaults.styles[`plot_bear_top_${i}`] = { visible: true, color: "rgba(225, 26, 26, 0)", linewidth: 1, linestyle: 0 };
        defaults.styles[`plot_bear_bottom_${i}`] = { visible: true, color: "rgba(225, 26, 26, 0)", linewidth: 1, linestyle: 0 };

        defaults.filledAreasStyle[`fillarea_bull_${i}`] = { color: "rgba(85, 229, 80, 0.2)", transparency: 80, visible: true };
        defaults.filledAreasStyle[`fillarea_bear_${i}`] = { color: "rgba(225, 26, 26, 0.2)", transparency: 80, visible: true };
    }

    return {
        name: "FVG",
        metainfo: {
            _metainfoVersion: 51,
            id: "fvg_custom@tv-basicstudies-1",
            name: "FVG",
            description: "Imbalance (FVG) Detector [Multiple]",
            shortDescription: "FVG",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: plots,
            filledAreas: filledAreas,
            defaults: defaults,
            inputs: [
                { id: "minThreshold", name: "Min Imbalance %", defval: 0.5, type: "float", min: 0.01, step: 0.01 },
                { id: "checkThreeCandles", name: "Requires 3 Same Color Candles", defval: true, type: "bool" }
            ],
            styles: styles,
            precision: 4,
            format: { type: "price", precision: 4 }
        },

        constructor: function () {
            this.init = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;
                this._history = [];
                this._activeBullFVGs = []; // [{ top, bottom, startTime }]
                this._activeBearFVGs = []; // [{ top, bottom, startTime }]
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const minThreshold = this._input(0);
                const checkThreeCandles = this._input(1);

                const h = PineJS.Std.high(this._context);
                const l = PineJS.Std.low(this._context);
                const o = PineJS.Std.open(this._context);
                const c = PineJS.Std.close(this._context);

                if (isNaN(c)) {
                    const padding = new Array(MAX_FVGS * 4).fill(NaN);
                    return padding;
                }

                this._history.push({ h, l, o, c });
                if (this._history.length > 5) this._history.shift();

                if (this._history.length >= 4) {
                    const hist = this._history;
                    // hist[0] is Bar[3], hist[1] is Bar[2], hist[2] is Bar[1], hist[3] is Current

                    const sameColorBull = !checkThreeCandles || (hist[0].c > hist[0].o && hist[1].c > hist[1].o && hist[2].c > hist[2].o);
                    const sameColorBear = !checkThreeCandles || (hist[0].c < hist[0].o && hist[1].c < hist[1].o && hist[2].c < hist[2].o);

                    // Bullish Imbalance: high[3] < low[1] => hist[0].h < hist[2].l
                    if (hist[0].h < hist[2].l && sameColorBull) {
                        const imbSize = hist[2].l - hist[0].h;
                        const percentSize = (imbSize / hist[0].h) * 100;
                        if (percentSize > minThreshold) {
                            this._activeBullFVGs.push({ top: hist[2].l, bottom: hist[0].h, mitigated: false });
                        }
                    }

                    // Bearish Imbalance: low[3] > high[1] => hist[0].l > hist[2].h
                    if (hist[0].l > hist[2].h && sameColorBear) {
                        const imbSize = hist[0].l - hist[2].h;
                        const percentSize = (imbSize / hist[0].l) * 100;
                        if (percentSize > minThreshold) {
                            this._activeBearFVGs.push({ top: hist[0].l, bottom: hist[2].h, mitigated: false });
                        }
                    }
                }

                // Check for mitigation
                for (let i = 0; i < this._activeBullFVGs.length; i++) {
                    if (!this._activeBullFVGs[i].mitigated && l <= this._activeBullFVGs[i].top) {
                        this._activeBullFVGs[i].mitigated = true;
                    }
                }
                for (let i = 0; i < this._activeBearFVGs.length; i++) {
                    if (!this._activeBearFVGs[i].mitigated && h >= this._activeBearFVGs[i].bottom) {
                        this._activeBearFVGs[i].mitigated = true;
                    }
                }

                // Filter unmitigated and keep only the last MAX_FVGS
                const unmitBull = this._activeBullFVGs.filter(f => !f.mitigated).slice(-MAX_FVGS);
                const unmitBear = this._activeBearFVGs.filter(f => !f.mitigated).slice(-MAX_FVGS);

                const result = [];
                for (let i = 0; i < MAX_FVGS; i++) {
                    const bull = unmitBull[i];
                    const bear = unmitBear[i];

                    // Result order: [bull_top_0, bull_bottom_0, bear_top_0, bear_bottom_0, ...]
                    result.push(bull ? bull.top : NaN);
                    result.push(bull ? bull.bottom : NaN);
                    result.push(bear ? bear.top : NaN);
                    result.push(bear ? bear.bottom : NaN);
                }

                // Cleanup to prevent memory leak
                if (this._activeBullFVGs.length > 50) this._activeBullFVGs = this._activeBullFVGs.filter(f => !f.mitigated || Math.random() > 0.5).slice(-50);
                if (this._activeBearFVGs.length > 50) this._activeBearFVGs = this._activeBearFVGs.filter(f => !f.mitigated || Math.random() > 0.5).slice(-50);

                return result;
            };
        }
    };
}
