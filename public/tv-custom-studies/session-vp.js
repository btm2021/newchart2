function createSessionVP(PineJS) {
    return {
        name: "Session Volume Profile",
        metainfo: {
            _metainfoVersion: 51,
            id: "SessionVP@tv-basicstudies-1",
            name: "Session Volume Profile",
            description: "Volume Profile by Session (Day/Week/Month)",
            shortDescription: "Session VP",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: "plot_poc", type: "line" },
                { id: "plot_val", type: "line" },
                { id: "plot_vah", type: "line" },
                { id: "plot_val_fill", type: "line" },  // For filled area
                { id: "plot_vah_fill", type: "line" }   // For filled area
            ],

            defaults: {
                styles: {
                    plot_poc: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#2962FF" // Blue for POC
                    },
                    plot_val: {
                        linestyle: 1, // Dashed
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#FF5252" // Red for VAL
                    },
                    plot_vah: {
                        linestyle: 1, // Dashed
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#00E676" // Green for VAH
                    },
                    plot_val_fill: {
                        linestyle: 0,
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 100,  // Invisible line
                        visible: true,
                        color: "#2962FF"
                    },
                    plot_vah_fill: {
                        linestyle: 0,
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 100,  // Invisible line
                        visible: true,
                        color: "#2962FF"
                    }
                },
                filledAreasStyle: {
                    fillarea_va: {
                        color: "#2962FF",
                        transparency: 90,
                        visible: true
                    }
                },
                inputs: {
                    period: "Session",
                    rowSize: 0.0001,
                    valueAreaVolume: 70
                }
            },

            inputs: [
                {
                    id: "period",
                    name: "Period",
                    defval: "Session",
                    type: "text",
                    options: ["Session", "Week", "Month"]
                },
                {
                    id: "rowSize",
                    name: "Price Row Size (Tick Size)",
                    defval: 0.0001,
                    type: "float",
                    min: 0.00001,
                    max: 1000,
                    step: 0.0001
                },
                {
                    id: "valueAreaVolume",
                    name: "Value Area Volume (%)",
                    defval: 70,
                    type: "integer",
                    min: 10,
                    max: 100
                }
            ],

            styles: {
                plot_poc: {
                    title: "POC (Point of Control)",
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_val: {
                    title: "VAL (Value Area Low)",
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_vah: {
                    title: "VAH (Value Area High)",
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_val_fill: {
                    title: "VAL Fill",
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_vah_fill: {
                    title: "VAH Fill",
                    histogramBase: 0,
                    joinPoints: false
                }
            },

            filledAreas: [
                {
                    id: "fillarea_va",
                    objAId: "plot_val_fill",
                    objBId: "plot_vah_fill",
                    type: "plot_plot",
                    title: "Value Area"
                }
            ],

            precision: 5,
            format: {
                type: "price",
                precision: 5
            }
        },

        constructor: function () {
            this.init = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Session tracking
                this.committed_profile = {};
                this.last_period_identifier = null;
                this.last_committed_index = -1;
                this.pending_bar_data = null;
                this.pending_bar_index = -1;

                // Stats from last completed profile
                this.current_poc = NaN;
                this.current_val = NaN;
                this.current_vah = NaN;

                console.log('[Session VP] Initialized');
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const period = this._input(0); // "Session", "Week", or "Month"
                const rowSize = this._input(1);
                const valueAreaPct = this._input(2);

                const time = PineJS.Std.time(this._context);
                const index = PineJS.Std.n(this._context);

                // Determine current period identifier
                const date = new Date(time);
                let current_period_identifier;

                if (period === "Session") {
                    // Session = Daily session starting at 0h UTC
                    current_period_identifier = date.getUTCFullYear() + "-" +
                        (date.getUTCMonth() + 1) + "-" +
                        date.getUTCDate();
                } else if (period === "Week") {
                    // Week - ISO Week starting Monday
                    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
                    const dayNum = d.getUTCDay() || 7;
                    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
                    current_period_identifier = d.getUTCFullYear() + "-W" + weekNo;
                } else if (period === "Month") {
                    // Month - starting 1st of month
                    current_period_identifier = date.getUTCFullYear() + "-M" + (date.getUTCMonth() + 1);
                } else {
                    // Fallback to Session
                    current_period_identifier = date.getUTCFullYear() + "-" +
                        (date.getUTCMonth() + 1) + "-" +
                        date.getUTCDate();
                }

                // Check for new session
                if (this.last_period_identifier !== null &&
                    this.last_period_identifier !== current_period_identifier) {

                    // Session changed - finalize the old profile
                    if (Object.keys(this.committed_profile).length > 0) {
                        const stats = this.calculateStats(this.committed_profile, valueAreaPct);
                        this.current_poc = stats.poc;
                        this.current_val = stats.val;
                        this.current_vah = stats.vah;

                        console.log('[Session VP] Period ended. POC:', stats.poc, 'VAL:', stats.val, 'VAH:', stats.vah);
                    }

                    // Reset for new session
                    this.committed_profile = {};
                    this.pending_bar_data = null;
                    this.last_committed_index = index - 1;
                }

                this.last_period_identifier = current_period_identifier;

                // Check if we moved to a new bar
                if (index > this.last_committed_index) {
                    // Commit the pending bar if it exists
                    if (this.pending_bar_data && this.pending_bar_index === index - 1) {
                        this.addToProfile(this.committed_profile, this.pending_bar_data, rowSize);
                    }
                    this.last_committed_index = index;
                }

                // Get current bar data
                const high = PineJS.Std.high(this._context);
                const low = PineJS.Std.low(this._context);
                const volume = PineJS.Std.volume(this._context);

                // Validate data
                if (isNaN(high) || isNaN(low) || isNaN(volume)) {
                    return [this.current_poc, this.current_val, this.current_vah, this.current_val, this.current_vah];
                }

                const current_bar_data = { high, low, volume };

                // Store for next commit
                this.pending_bar_data = current_bar_data;
                this.pending_bar_index = index;

                // Create display profile (includes current bar)
                const display_profile = Object.assign({}, this.committed_profile);
                this.addToProfile(display_profile, current_bar_data, rowSize);

                // Calculate stats for current session (live update)
                if (Object.keys(display_profile).length > 0) {
                    const stats = this.calculateStats(display_profile, valueAreaPct);
                    return [stats.poc, stats.val, stats.vah, stats.val, stats.vah];
                }

                return [this.current_poc, this.current_val, this.current_vah, this.current_val, this.current_vah];
            };

            this.addToProfile = function (profile, data, rowSize) {
                if (!data || !data.volume || data.volume <= 0) return;
                if (isNaN(data.high) || isNaN(data.low)) return;

                // Use the provided rowSize directly
                const tickSize = rowSize;

                const minPrice = Math.floor(data.low / tickSize) * tickSize;
                const maxPrice = Math.floor(data.high / tickSize) * tickSize;

                if (minPrice === maxPrice) {
                    // Single price level (doji bar)
                    const key = this.priceKey(minPrice);
                    profile[key] = (profile[key] || 0) + data.volume;
                } else {
                    // Distribute volume across price levels
                    const steps = Math.round((maxPrice - minPrice) / tickSize) + 1;
                    const volPerStep = data.volume / steps;

                    for (let p = minPrice; p <= maxPrice + tickSize * 0.1; p += tickSize) {
                        const key = this.priceKey(p);
                        profile[key] = (profile[key] || 0) + volPerStep;
                    }
                }
            };

            this.priceKey = function (price) {
                // Round to 10 decimal places to avoid floating point issues
                return Math.round(price * 10000000000) / 10000000000;
            };

            this.calculateStats = function (profile, vaPct) {
                const keys = Object.keys(profile);

                if (keys.length === 0) {
                    return { poc: NaN, val: NaN, vah: NaN };
                }

                // Build sorted array of price levels
                const levels = [];
                let maxVol = 0;
                let pocPrice = NaN;
                let totalVol = 0;

                for (const key of keys) {
                    const price = parseFloat(key);
                    const vol = profile[key];

                    totalVol += vol;
                    levels.push({ price, vol });

                    if (vol > maxVol) {
                        maxVol = vol;
                        pocPrice = price;
                    }
                }

                if (levels.length === 0 || totalVol === 0) {
                    return { poc: NaN, val: NaN, vah: NaN };
                }

                // Sort by price
                levels.sort((a, b) => a.price - b.price);

                // Find POC index
                let pocIndex = -1;
                for (let i = 0; i < levels.length; i++) {
                    if (Math.abs(levels[i].price - pocPrice) < 0.00000001) {
                        pocIndex = i;
                        break;
                    }
                }

                if (pocIndex === -1) {
                    pocIndex = 0; // Fallback
                }

                // Calculate Value Area (expand from POC)
                const targetVol = totalVol * (vaPct / 100);
                let currentVol = levels[pocIndex].vol;
                let upIdx = pocIndex;
                let downIdx = pocIndex;

                // Expand from POC until we reach target volume
                while (currentVol < targetVol && (upIdx < levels.length - 1 || downIdx > 0)) {
                    const upVol = (upIdx < levels.length - 1) ? levels[upIdx + 1].vol : 0;
                    const downVol = (downIdx > 0) ? levels[downIdx - 1].vol : 0;

                    if (upVol === 0 && downVol === 0) break;

                    if (upVol >= downVol && upIdx < levels.length - 1) {
                        upIdx++;
                        currentVol += upVol;
                    } else if (downIdx > 0) {
                        downIdx--;
                        currentVol += downVol;
                    } else {
                        break;
                    }
                }

                return {
                    poc: pocPrice,
                    val: levels[downIdx].price,
                    vah: levels[upIdx].price
                };
            };
        }
    };
}
