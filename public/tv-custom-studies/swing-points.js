/**
 * Swing High/Low Indicator
 * Tìm và đánh dấu các điểm Swing High và Swing Low
 */

function createSwingPoints(PineJS) {
    return {
        name: 'Swing High/Low',
        metainfo: {
            _metainfoVersion: 51,
            id: 'swing_points@tv-basicstudies-1',
            name: 'Swing High/Low',
            description: 'Swing High/Low Points',
            shortDescription: 'Swing HL',
            is_hidden_study: false,
            is_price_study: true,
            isCustomIndicator: true,

            plots: [
                { id: 'plot_0', type: 'line' },  // Swing High
                { id: 'plot_1', type: 'line' }   // Swing Low
            ],

            defaults: {
                styles: {
                    plot_0: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 2,  // 2 = circles
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: '#FF5252'
                    },
                    plot_1: {
                        linestyle: 0,
                        linewidth: 2,
                        plottype: 2,  // 2 = circles
                        trackPrice: false,
                        transparency: 0,
                        visible: true,
                        color: '#4CAF50'
                    }
                },
                inputs: {
                    left_bars: 5,
                    right_bars: 5
                }
            },

            inputs: [
                {
                    id: 'left_bars',
                    name: 'Left Bars',
                    defval: 5,
                    type: 'integer',
                    min: 1,
                    max: 50
                },
                {
                    id: 'right_bars',
                    name: 'Right Bars',
                    defval: 5,
                    type: 'integer',
                    min: 1,
                    max: 50
                }
            ],

            styles: {
                plot_0: {
                    title: 'Swing High',
                    histogramBase: 0,
                    joinPoints: false
                },
                plot_1: {
                    title: 'Swing Low',
                    histogramBase: 0,
                    joinPoints: false
                }
            },

            precision: 4,
            format: {
                type: 'price',
                precision: 4
            }
        },

        constructor: function() {
            this.init = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;
                
                // Store swing points history
                this.swingHighs = [];
                this.swingLows = [];
            };

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;
                
                const leftBars = this._input(0);
                const rightBars = this._input(1);
                
                // Get current bar data at offset rightBars (to have enough future bars)
                const offset = rightBars;
                const high = PineJS.Std.high(this._context, offset);
                const low = PineJS.Std.low(this._context, offset);
                
                // Check if we have enough data
                if (isNaN(high) || isNaN(low)) {
                    return [NaN, NaN];
                }
                
                // Check Swing High
                let isSwingHigh = true;
                
                // Check left bars (older bars)
                for (let i = 1; i <= leftBars; i++) {
                    const pastHigh = PineJS.Std.high(this._context, offset + i);
                    if (isNaN(pastHigh) || high <= pastHigh) {
                        isSwingHigh = false;
                        break;
                    }
                }
                
                // Check right bars (newer bars)
                if (isSwingHigh) {
                    for (let i = 1; i <= rightBars; i++) {
                        const futureHigh = PineJS.Std.high(this._context, offset - i);
                        if (isNaN(futureHigh) || high <= futureHigh) {
                            isSwingHigh = false;
                            break;
                        }
                    }
                }
                
                // Check Swing Low
                let isSwingLow = true;
                
                // Check left bars (older bars)
                for (let i = 1; i <= leftBars; i++) {
                    const pastLow = PineJS.Std.low(this._context, offset + i);
                    if (isNaN(pastLow) || low >= pastLow) {
                        isSwingLow = false;
                        break;
                    }
                }
                
                // Check right bars (newer bars)
                if (isSwingLow) {
                    for (let i = 1; i <= rightBars; i++) {
                        const futureLow = PineJS.Std.low(this._context, offset - i);
                        if (isNaN(futureLow) || low >= futureLow) {
                            isSwingLow = false;
                            break;
                        }
                    }
                }
                
                // Return values: [swing_high, swing_low]
                // Only show the point at the swing bar location
                return [
                    isSwingHigh ? high : NaN,
                    isSwingLow ? low : NaN
                ];
            };
        }
    };
}

// Register study
if (typeof TradingView !== 'undefined' && TradingView.widget) {
    console.log('[Swing Points] Registering custom study...');
}
