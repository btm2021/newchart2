// VSR Original (Volume Spike Reversal) Custom Study
// Modified version - No repainting, simplified without volume profile

function createVSROriginal(PineJS) {
    return {
        name: "VSR Original",
        metainfo: {
            _metainfoVersion: 51,
            id: "vsr_original@tv-basicstudies-1",
            name: "VSR Original",
            description: "Volume Spike Reversal Levels - Original (No Repaint)",
            shortDescription: "VSR Original",
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: "plot_0", type: "line" },
                { id: "plot_1", type: "line" }
            ],

            defaults: {
                styles: {
                    plot_0: {
                        linestyle: 0,
                        linewidth: 0,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#FFEB3B"
                    },
                    plot_1: {
                        linestyle: 0,
                        linewidth: 0,
                        plottype: 0,
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: "#FFEB3B"
                    }
                },
                filledAreasStyle: {
                    fillarea_0: {
                        color: "#FFEB3B",
                        transparency: 50,
                        visible: true
                    }
                },
                inputs: {
                    vsr2_length: 10,
                    vsr2_threshold: 10.0
                }
            },

            inputs: [
                {
                    id: "vsr2_length",
                    name: "Volume SD Length",
                    defval: 10,
                    type: "integer",
                    min: 1,
                    max: 500
                },
                {
                    id: "vsr2_threshold",
                    name: "Volume Threshold",
                    defval: 10.0,
                    type: "float",
                    min: 1.0,
                    max: 20.0,
                    step: 0.1
                }
            ],

            styles: {
                plot_0: {
                    title: "VSR Upper",
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_1: {
                    title: "VSR Lower",
                    histogramBase: 0,
                    joinPoints: false
                }
            },

            filledAreas: [
                {
                    id: "fillarea_0",
                    objAId: "plot_0",
                    objBId: "plot_1",
                    type: "plot_plot",
                    title: "VSR Zone"
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
                this.prev_volume = NaN;
                this.prev_stdev = NaN;

                // Current VSR zone levels
                this.vsr_upper = NaN;
                this.vsr_lower = NaN;

                // Array to store volume changes for stdev calculation
                this.volume_changes = [];
            };

            this.main = function (context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Get input values
                const length = this._input(0);
                const threshold = this._input(1);

                // Get price and volume data for CURRENT candle
                const high = PineJS.Std.high(this._context);
                const low = PineJS.Std.low(this._context);
                const close = PineJS.Std.close(this._context);
                const volume = PineJS.Std.volume(this._context);

                // Calculate volume change
                let change = 0;
                if (!isNaN(this.prev_volume) && this.prev_volume !== 0) {
                    change = volume / this.prev_volume - 1;
                }

                // Store volume change in array
                this.volume_changes.push(change);
                if (this.volume_changes.length > length) {
                    this.volume_changes.shift(); // Remove oldest value
                }

                // Calculate standard deviation of volume changes
                let stdev = 0;
                if (this.volume_changes.length >= 2) {
                    // Calculate mean
                    const sum = this.volume_changes.reduce((a, b) => a + b, 0);
                    const mean = sum / this.volume_changes.length;

                    // Calculate variance
                    const variance = this.volume_changes.reduce((acc, val) => {
                        return acc + Math.pow(val - mean, 2);
                    }, 0) / this.volume_changes.length;

                    // Standard deviation
                    stdev = Math.sqrt(variance);
                }

                // Calculate difference and signal
                let difference = 0;
                let signal = 0;

                if (!isNaN(this.prev_stdev) && this.prev_stdev !== 0 && this.volume_changes.length >= 2) {
                    difference = change / this.prev_stdev;
                    signal = Math.abs(difference);
                }

                // Update VSR levels when signal exceeds threshold
                // Use CURRENT candle's data to avoid repainting
                if (signal > threshold && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
                    const proposed_upper = Math.max(high, close);
                    const proposed_lower = Math.min(low, close);

                    // Check for overlap with existing VSR zone
                    let isOverlap = false;
                    if (!isNaN(this.vsr_upper) && !isNaN(this.vsr_lower)) {
                        // Overlap condition: Range A overlaps Range B if StartA <= EndB and StartB <= EndA
                        if (proposed_lower <= this.vsr_upper && this.vsr_lower <= proposed_upper) {
                            isOverlap = true;
                        }
                    }

                    if (isOverlap) {
                        // Merge zones - extend the existing zone
                        this.vsr_upper = Math.max(this.vsr_upper, proposed_upper);
                        this.vsr_lower = Math.min(this.vsr_lower, proposed_lower);
                    } else {
                        // New separate zone - create new VSR zone
                        this.vsr_upper = proposed_upper;
                        this.vsr_lower = proposed_lower;
                    }
                }

                // Store current values for next bar
                this.prev_volume = volume;
                this.prev_stdev = stdev;

                // Return current VSR levels
                let upper = this.vsr_upper;
                let lower = this.vsr_lower;

                // Handle NaNs
                if (isNaN(upper)) upper = NaN;
                if (isNaN(lower)) lower = NaN;

                return [upper, lower];
            };
        }
    };
}
