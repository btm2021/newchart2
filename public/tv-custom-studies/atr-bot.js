// ATR Bot Custom Study
// Converted from PineScript to TradingView Charting Library format

function createATRBot(PineJS) {
    return {
        name: "ATR Bot",
        metainfo: {
            _metainfoVersion: 51,
            id: "atrbot@tv-basicstudies-1",
            name: "ATR Bot",
            description: "ATR Dynamic Trail with EMA and State Change Detection",
            shortDescription: "ATR Bot",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: "plot_0", type: "line" },
                { id: "plot_1", type: "line" },
                { id: "plot_2", type: "line" },  // Trail1 for green fill
                { id: "plot_3", type: "line" }   // Trail1 for red fill
            ],

            defaults: {
                styles: {
                    plot_0: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#26a69a"
                    },
                    plot_1: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#ef5350"
                    },
                    plot_2: {
                        linestyle: 0,
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 100,
                        visible: true,
                        color: "#26a69a"
                    },
                    plot_3: {
                        linestyle: 0,
                        linewidth: 1,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 100,
                        visible: true,
                        color: "#ef5350"
                    }
                },
                filledAreasStyle: {
                    fillarea_0: {
                        color: "#26a69a",
                        transparency: 85,
                        visible: true
                    },
                    fillarea_1: {
                        color: "#ef5350",
                        transparency: 85,
                        visible: true
                    }
                },
                inputs: {
                    tf_atr_length: 14,
                    tf_atr_mult: 2.0,
                    source: "close",
                    ma_type: "EMA",
                    ma_length: 30
                }
            },

            inputs: [
                {
                    id: "tf_atr_length",
                    name: "ATR Length",
                    defval: 14,
                    type: "integer",
                    min: 1,
                    max: 500
                },
                {
                    id: "tf_atr_mult",
                    name: "ATR Multiplier",
                    defval: 2.0,
                    type: "float",
                    min: 0.1,
                    max: 10.0,
                    step: 0.1
                },
                {
                    id: "source",
                    name: "Source",
                    defval: "close",
                    type: "source",
                    options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"]
                },
                {
                    id: "ma_type",
                    name: "MA Type",
                    defval: "EMA",
                    type: "text",
                    options: ["EMA", "LWMA", "HMA", "VWMA", "WMA", "VWAP", "ALMA", "TEMA", "WWSMA", "ZLEMA", "LSMA", "KAMA", "VIDYA", "SMMA", "McGinley", "SWMA"]
                },
                {
                    id: "ma_length",
                    name: "MA Length",
                    defval: 30,
                    type: "integer",
                    min: 1,
                    max: 500
                }
            ],

            styles: {
                plot_0: {
                    title: "Trail 1 (MA)",
                    histogramBase: 0,
                    joinPoints: true
                },
                plot_1: {
                    title: "Trail 2 (ATR Trail)",
                    histogramBase: 0,
                    joinPoints: true
                },
                plot_2: {
                    title: "Trail 1 Green",
                    histogramBase: 0,
                    joinPoints: true
                },
                plot_3: {
                    title: "Trail 1 Red",
                    histogramBase: 0,
                    joinPoints: true
                }
            },

            filledAreas: [
                {
                    id: "fillarea_0",
                    objAId: "plot_2",
                    objBId: "plot_1",
                    type: "plot_plot",
                    title: "Green Fill (Trail1 > Trail2)"
                },
                {
                    id: "fillarea_1",
                    objAId: "plot_3",
                    objBId: "plot_1",
                    type: "plot_plot",
                    title: "Red Fill (Trail1 < Trail2)"
                }
            ],

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

                // Variables to store previous values
                this.trail2_prev = NaN;
                this.ma_prev = NaN;
                this.trail1_prev_bar = NaN;

                // Variables for ATR RMA calculation
                this.atr_prev = NaN;
                this.prev_close = NaN;

                // Variables for VWMA calculation
                this.vwma_sum_pv = 0;
                this.vwma_sum_v = 0;
                this.vwma_buffer = [];

                // Variables for LWMA calculation
                this.lwma_buffer = [];

                // Variables for HULL calculation
                this.hull_wma1_buffer = [];
                this.hull_wma2_buffer = [];
                this.hull_wma3_buffer = [];

                // Variables for WMA calculation
                this.wma_buffer = [];

                // Variables for VWAP calculation
                this.vwap_sum_pv = 0;
                this.vwap_sum_v = 0;
                this.vwap_buffer = [];

                // Variables for ALMA calculation
                this.alma_buffer = [];

                // Variables for TEMA calculation
                this.tema_ema1 = NaN;
                this.tema_ema2 = NaN;
                this.tema_ema3 = NaN;

                // Variables for WWSMA calculation
                this.wwsma_buffer = [];

                // Variables for ZLEMA calculation
                this.zlema_prev = NaN;

                // Variables for LSMA calculation
                this.lsma_buffer = [];

                // Variables for KAMA calculation
                this.kama_prev = NaN;

                // Variables for VIDYA calculation
                this.vidya_prev = NaN;
                this.vidya_cmo_buffer = [];

                // Variables for SMMA calculation
                this.smma_prev = NaN;
                this.smma_sum = 0;
                this.smma_count = 0;

                // Variables for McGinley Dynamic calculation
                this.mcginley_prev = NaN;

                // Variables for SWMA calculation
                this.swma_buffer = [];
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Get input values
                const atr_length = this._input(0);
                const atr_mult = this._input(1);
                const source_type = this._input(2);
                const ma_type = this._input(3);
                const ma_length = this._input(4);

                // Get price data
                const high = PineJS.Std.high(this._context);
                const low = PineJS.Std.low(this._context);
                const close = PineJS.Std.close(this._context);
                const open = PineJS.Std.open(this._context);
                const volume = PineJS.Std.volume(this._context);

                // Get source based on input type
                let src;
                switch (source_type) {
                    case "open":
                        src = open;
                        break;
                    case "high":
                        src = high;
                        break;
                    case "low":
                        src = low;
                        break;
                    case "hl2":
                        src = (high + low) / 2;
                        break;
                    case "hlc3":
                        src = (high + low + close) / 3;
                        break;
                    case "ohlc4":
                        src = (open + high + low + close) / 4;
                        break;
                    default:
                        src = close;
                }

                // Calculate MA (Trail1) based on selected type
                let trail1;
                
                switch (ma_type) {
                    case "EMA":
                        // EMA calculation
                        if (isNaN(this.ma_prev)) {
                            trail1 = src;
                        } else {
                            const alpha = 2.0 / (ma_length + 1);
                            trail1 = alpha * src + (1 - alpha) * this.ma_prev;
                        }
                        break;

                    case "VWMA":
                        // VWMA calculation
                        this.vwma_buffer.push({ price: src, volume: volume });
                        if (this.vwma_buffer.length > ma_length) {
                            this.vwma_buffer.shift();
                        }
                        
                        let sum_pv = 0;
                        let sum_v = 0;
                        for (let i = 0; i < this.vwma_buffer.length; i++) {
                            sum_pv += this.vwma_buffer[i].price * this.vwma_buffer[i].volume;
                            sum_v += this.vwma_buffer[i].volume;
                        }
                        trail1 = sum_v > 0 ? sum_pv / sum_v : src;
                        break;

                    case "LWMA":
                        // LWMA calculation
                        this.lwma_buffer.push(src);
                        if (this.lwma_buffer.length > ma_length) {
                            this.lwma_buffer.shift();
                        }
                        
                        let lwma_sum = 0;
                        let lwma_weight_sum = 0;
                        for (let i = 0; i < this.lwma_buffer.length; i++) {
                            const weight = i + 1;
                            lwma_sum += this.lwma_buffer[i] * weight;
                            lwma_weight_sum += weight;
                        }
                        trail1 = lwma_weight_sum > 0 ? lwma_sum / lwma_weight_sum : src;
                        break;

                    case "HMA":
                    case "HULL":
                        // HULL calculation (HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n)))
                        const half_length = Math.floor(ma_length / 2);
                        const sqrt_length = Math.floor(Math.sqrt(ma_length));
                        
                        // Add to buffers
                        this.hull_wma1_buffer.push(src);
                        this.hull_wma2_buffer.push(src);
                        
                        if (this.hull_wma1_buffer.length > half_length) {
                            this.hull_wma1_buffer.shift();
                        }
                        if (this.hull_wma2_buffer.length > ma_length) {
                            this.hull_wma2_buffer.shift();
                        }
                        
                        // Calculate WMA(n/2)
                        let wma1_sum = 0;
                        let wma1_weight = 0;
                        for (let i = 0; i < this.hull_wma1_buffer.length; i++) {
                            const w = i + 1;
                            wma1_sum += this.hull_wma1_buffer[i] * w;
                            wma1_weight += w;
                        }
                        const wma1 = wma1_weight > 0 ? wma1_sum / wma1_weight : src;
                        
                        // Calculate WMA(n)
                        let wma2_sum = 0;
                        let wma2_weight = 0;
                        for (let i = 0; i < this.hull_wma2_buffer.length; i++) {
                            const w = i + 1;
                            wma2_sum += this.hull_wma2_buffer[i] * w;
                            wma2_weight += w;
                        }
                        const wma2 = wma2_weight > 0 ? wma2_sum / wma2_weight : src;
                        
                        // Calculate 2*WMA(n/2) - WMA(n)
                        const raw_hull = 2 * wma1 - wma2;
                        
                        // Add to final buffer for WMA(sqrt(n))
                        this.hull_wma3_buffer.push(raw_hull);
                        if (this.hull_wma3_buffer.length > sqrt_length) {
                            this.hull_wma3_buffer.shift();
                        }
                        
                        // Calculate final WMA(sqrt(n))
                        let wma3_sum = 0;
                        let wma3_weight = 0;
                        for (let i = 0; i < this.hull_wma3_buffer.length; i++) {
                            const w = i + 1;
                            wma3_sum += this.hull_wma3_buffer[i] * w;
                            wma3_weight += w;
                        }
                        trail1 = wma3_weight > 0 ? wma3_sum / wma3_weight : src;
                        break;

                    case "WMA":
                        // WMA calculation (Weighted Moving Average)
                        this.wma_buffer.push(src);
                        if (this.wma_buffer.length > ma_length) {
                            this.wma_buffer.shift();
                        }
                        
                        let wma_sum = 0;
                        let wma_weight_sum = 0;
                        for (let i = 0; i < this.wma_buffer.length; i++) {
                            const weight = i + 1;
                            wma_sum += this.wma_buffer[i] * weight;
                            wma_weight_sum += weight;
                        }
                        trail1 = wma_weight_sum > 0 ? wma_sum / wma_weight_sum : src;
                        break;

                    case "VWAP":
                        // VWAP calculation (Volume Weighted Average Price)
                        const typical_price = (high + low + close) / 3;
                        this.vwap_buffer.push({ price: typical_price, volume: volume });
                        if (this.vwap_buffer.length > ma_length) {
                            this.vwap_buffer.shift();
                        }
                        
                        let vwap_sum_pv = 0;
                        let vwap_sum_v = 0;
                        for (let i = 0; i < this.vwap_buffer.length; i++) {
                            vwap_sum_pv += this.vwap_buffer[i].price * this.vwap_buffer[i].volume;
                            vwap_sum_v += this.vwap_buffer[i].volume;
                        }
                        trail1 = vwap_sum_v > 0 ? vwap_sum_pv / vwap_sum_v : src;
                        break;

                    case "ALMA":
                        // ALMA calculation (Arnaud Legoux Moving Average)
                        const alma_offset = 0.85;
                        const alma_sigma = 6;
                        
                        this.alma_buffer.push(src);
                        if (this.alma_buffer.length > ma_length) {
                            this.alma_buffer.shift();
                        }
                        
                        const m = Math.floor(alma_offset * (ma_length - 1));
                        const s = ma_length / alma_sigma;
                        let alma_norm = 0;
                        let alma_sum = 0;
                        
                        for (let i = 0; i < this.alma_buffer.length; i++) {
                            const weight = Math.exp(-1 * Math.pow(i - m, 2) / (2 * Math.pow(s, 2)));
                            alma_norm += weight;
                            alma_sum += this.alma_buffer[i] * weight;
                        }
                        trail1 = alma_norm > 0 ? alma_sum / alma_norm : src;
                        break;

                    case "TEMA":
                        // TEMA calculation (Triple Exponential Moving Average)
                        const tema_alpha = 2.0 / (ma_length + 1);
                        
                        if (isNaN(this.tema_ema1)) {
                            this.tema_ema1 = src;
                            this.tema_ema2 = src;
                            this.tema_ema3 = src;
                        } else {
                            this.tema_ema1 = tema_alpha * src + (1 - tema_alpha) * this.tema_ema1;
                            this.tema_ema2 = tema_alpha * this.tema_ema1 + (1 - tema_alpha) * this.tema_ema2;
                            this.tema_ema3 = tema_alpha * this.tema_ema2 + (1 - tema_alpha) * this.tema_ema3;
                        }
                        trail1 = 3 * this.tema_ema1 - 3 * this.tema_ema2 + this.tema_ema3;
                        break;

                    case "WWSMA":
                        // WWSMA calculation (Welles Wilder's Smoothing Moving Average)
                        this.wwsma_buffer.push(src);
                        if (this.wwsma_buffer.length > ma_length) {
                            this.wwsma_buffer.shift();
                        }
                        
                        if (this.wwsma_buffer.length < ma_length) {
                            // Not enough data, use simple average
                            let wwsma_sum = 0;
                            for (let i = 0; i < this.wwsma_buffer.length; i++) {
                                wwsma_sum += this.wwsma_buffer[i];
                            }
                            trail1 = wwsma_sum / this.wwsma_buffer.length;
                        } else {
                            // Use Wilder's smoothing: (prev * (n-1) + current) / n
                            if (isNaN(this.ma_prev)) {
                                let wwsma_sum = 0;
                                for (let i = 0; i < this.wwsma_buffer.length; i++) {
                                    wwsma_sum += this.wwsma_buffer[i];
                                }
                                trail1 = wwsma_sum / ma_length;
                            } else {
                                trail1 = (this.ma_prev * (ma_length - 1) + src) / ma_length;
                            }
                        }
                        break;

                    case "ZLEMA":
                        // ZLEMA calculation (Zero Lag Exponential Moving Average)
                        const zlema_lag = Math.floor((ma_length - 1) / 2);
                        const zlema_alpha = 2.0 / (ma_length + 1);
                        
                        // Store history for lag calculation
                        if (!this.zlema_buffer) this.zlema_buffer = [];
                        this.zlema_buffer.push(src);
                        if (this.zlema_buffer.length > zlema_lag + 1) {
                            this.zlema_buffer.shift();
                        }
                        
                        let zlema_data = src;
                        if (this.zlema_buffer.length > zlema_lag) {
                            zlema_data = src + (src - this.zlema_buffer[0]);
                        }
                        
                        if (isNaN(this.zlema_prev)) {
                            trail1 = zlema_data;
                        } else {
                            trail1 = zlema_alpha * zlema_data + (1 - zlema_alpha) * this.zlema_prev;
                        }
                        this.zlema_prev = trail1;
                        break;

                    case "LSMA":
                        // LSMA calculation (Least Squares Moving Average)
                        this.lsma_buffer.push(src);
                        if (this.lsma_buffer.length > ma_length) {
                            this.lsma_buffer.shift();
                        }
                        
                        if (this.lsma_buffer.length >= 2) {
                            let sum_x = 0, sum_y = 0, sum_xy = 0, sum_xx = 0;
                            const n = this.lsma_buffer.length;
                            
                            for (let i = 0; i < n; i++) {
                                sum_x += i;
                                sum_y += this.lsma_buffer[i];
                                sum_xy += i * this.lsma_buffer[i];
                                sum_xx += i * i;
                            }
                            
                            const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
                            const intercept = (sum_y - slope * sum_x) / n;
                            trail1 = intercept + slope * (n - 1);
                        } else {
                            trail1 = src;
                        }
                        break;

                    case "KAMA":
                        // KAMA calculation (Kaufman's Adaptive Moving Average)
                        if (!this.kama_buffer) this.kama_buffer = [];
                        this.kama_buffer.push(src);
                        if (this.kama_buffer.length > ma_length + 1) {
                            this.kama_buffer.shift();
                        }
                        
                        if (this.kama_buffer.length > ma_length) {
                            // Calculate efficiency ratio
                            const change = Math.abs(src - this.kama_buffer[0]);
                            let volatility = 0;
                            for (let i = 1; i < this.kama_buffer.length; i++) {
                                volatility += Math.abs(this.kama_buffer[i] - this.kama_buffer[i - 1]);
                            }
                            const er = volatility > 0 ? change / volatility : 0;
                            
                            // Smoothing constants
                            const fastest = 2.0 / (2 + 1);
                            const slowest = 2.0 / (30 + 1);
                            const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
                            
                            if (isNaN(this.kama_prev)) {
                                trail1 = src;
                            } else {
                                trail1 = this.kama_prev + sc * (src - this.kama_prev);
                            }
                            this.kama_prev = trail1;
                        } else {
                            trail1 = isNaN(this.kama_prev) ? src : this.kama_prev;
                        }
                        break;

                    case "VIDYA":
                        // VIDYA calculation (Variable Index Dynamic Average)
                        if (!this.vidya_cmo_buffer) this.vidya_cmo_buffer = [];
                        this.vidya_cmo_buffer.push(src);
                        if (this.vidya_cmo_buffer.length > ma_length + 1) {
                            this.vidya_cmo_buffer.shift();
                        }
                        
                        let cmo = 0;
                        if (this.vidya_cmo_buffer.length > 1) {
                            let sum_up = 0, sum_down = 0;
                            for (let i = 1; i < this.vidya_cmo_buffer.length; i++) {
                                const diff = this.vidya_cmo_buffer[i] - this.vidya_cmo_buffer[i - 1];
                                if (diff > 0) sum_up += diff;
                                else sum_down += Math.abs(diff);
                            }
                            const total = sum_up + sum_down;
                            cmo = total > 0 ? Math.abs((sum_up - sum_down) / total) : 0;
                        }
                        
                        const vidya_alpha = 2.0 / (ma_length + 1) * cmo;
                        if (isNaN(this.vidya_prev)) {
                            trail1 = src;
                        } else {
                            trail1 = vidya_alpha * src + (1 - vidya_alpha) * this.vidya_prev;
                        }
                        this.vidya_prev = trail1;
                        break;

                    case "SMMA":
                        // SMMA calculation (Smoothed Moving Average)
                        if (isNaN(this.smma_prev)) {
                            this.smma_sum += src;
                            this.smma_count++;
                            if (this.smma_count >= ma_length) {
                                trail1 = this.smma_sum / ma_length;
                                this.smma_prev = trail1;
                            } else {
                                trail1 = src;
                            }
                        } else {
                            trail1 = (this.smma_prev * (ma_length - 1) + src) / ma_length;
                            this.smma_prev = trail1;
                        }
                        break;

                    case "McGinley":
                        // McGinley Dynamic calculation
                        if (isNaN(this.mcginley_prev)) {
                            trail1 = src;
                        } else {
                            const mg_factor = src / this.mcginley_prev;
                            const mg_divisor = ma_length * Math.pow(mg_factor, 4);
                            trail1 = this.mcginley_prev + (src - this.mcginley_prev) / mg_divisor;
                        }
                        this.mcginley_prev = trail1;
                        break;

                    case "SWMA":
                        // SWMA calculation (Symmetrically Weighted Moving Average)
                        // Uses weights: 1, 2, 2, 1 for 4-period
                        this.swma_buffer.push(src);
                        if (this.swma_buffer.length > 4) {
                            this.swma_buffer.shift();
                        }
                        
                        if (this.swma_buffer.length === 4) {
                            trail1 = (this.swma_buffer[0] + 2 * this.swma_buffer[1] + 
                                     2 * this.swma_buffer[2] + this.swma_buffer[3]) / 6;
                        } else {
                            trail1 = src;
                        }
                        break;

                    default:
                        trail1 = src;
                }

                // Calculate True Range
                let tr;
                if (isNaN(this.prev_close)) {
                    // First bar - use high-low
                    tr = high - low;
                } else {
                    tr = Math.max(
                        high - low,
                        Math.abs(high - this.prev_close),
                        Math.abs(low - this.prev_close)
                    );
                }

                // Calculate ATR using RMA (Wilder's smoothing) - same as ta.atr() in PineScript
                let atr;
                if (isNaN(this.atr_prev)) {
                    // First bar - use TR as initial ATR
                    atr = tr;
                } else {
                    // RMA formula: (prev_atr * (length - 1) + tr) / length
                    atr = (this.atr_prev * (atr_length - 1) + tr) / atr_length;
                }

                const atr_value = atr * atr_mult;

                // Calculate Trail2 based on PineScript logic
                let trail2;
                const trail2_prev = isNaN(this.trail2_prev) ? 0 : this.trail2_prev;
                const trail1_prev = isNaN(this.trail1_prev_bar) ? trail1 : this.trail1_prev_bar;

                // PineScript logic:
                // iff_1 = Trail1 > nz(Trail2[1], 0) ? Trail1 - SL2 : Trail1 + SL2
                // iff_2 = Trail1 < nz(Trail2[1], 0) and Trail1[1] < nz(Trail2[1], 0) ? 
                //         math.min(nz(Trail2[1], 0), Trail1 + SL2) : iff_1
                // Trail2 := Trail1 > nz(Trail2[1], 0) and Trail1[1] > nz(Trail2[1], 0) ? 
                //           math.max(nz(Trail2[1], 0), Trail1 - SL2) : iff_2

                if (trail1 > trail2_prev) {
                    if (trail1_prev > trail2_prev) {
                        // Uptrend continues: math.max(trail2_prev, trail1 - atr_value)
                        trail2 = Math.max(trail2_prev, trail1 - atr_value);
                    } else {
                        // New uptrend: trail1 - atr_value
                        trail2 = trail1 - atr_value;
                    }
                } else {
                    if (trail1 < trail2_prev && trail1_prev < trail2_prev) {
                        // Downtrend continues: math.min(trail2_prev, trail1 + atr_value)
                        trail2 = Math.min(trail2_prev, trail1 + atr_value);
                    } else {
                        // New downtrend: trail1 + atr_value
                        trail2 = trail1 + atr_value;
                    }
                }

                // Store values for next bar
                this.trail1_prev_bar = trail1;
                this.trail2_prev = trail2;
                this.ma_prev = trail1;
                this.atr_prev = atr;
                this.prev_close = close;

                // Determine which fill to show based on trail1 vs trail2
                let trail1_green = NaN;  // For green fill (when trail1 > trail2)
                let trail1_red = NaN;    // For red fill (when trail1 < trail2)

                if (trail1 > trail2) {
                    trail1_green = trail1;  // Show green fill
                    trail1_red = NaN;       // Hide red fill
                } else {
                    trail1_green = NaN;     // Hide green fill
                    trail1_red = trail1;    // Show red fill
                }

                // Return plots: [trail1, trail2, trail1_green, trail1_red]
                return [trail1, trail2, trail1_green, trail1_red];
            };
        }
    };
}
