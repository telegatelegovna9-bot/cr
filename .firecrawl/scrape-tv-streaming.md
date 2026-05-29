[Skip to main content](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#__docusaurus_skipToContent_fallback)

[Home button](https://www.tradingview.com/charting-library-docs/)[Documentation](https://www.tradingview.com/charting-library-docs/latest/getting_started/) [Tutorials](https://www.tradingview.com/charting-library-docs/latest/tutorials/) [API Reference](https://www.tradingview.com/charting-library-docs/latest/api/) [What's new](https://www.tradingview.com/charting-library-docs/blog)

[Versions](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#)

- [v29](https://www.tradingview.com/charting-library-docs/v29/getting_started)
- [v28](https://www.tradingview.com/charting-library-docs/v28/getting_started)
- [v27](https://www.tradingview.com/charting-library-docs/v27/getting_started)
- [v26](https://www.tradingview.com/charting-library-docs/v26/getting_started)

Search`` `K`

- [Tutorials](https://www.tradingview.com/charting-library-docs/latest/tutorials/)
- [Run the Library](https://www.tradingview.com/charting-library-docs/latest/tutorials/First-Run-Tutorial)
- [Enable debug mode](https://www.tradingview.com/charting-library-docs/latest/tutorials/enable-debug-mode)
- [Connect data via Datafeed API](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/)

  - [Set up the widget](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Widget-Setup)
  - [Implement datafeed](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Datafeed-Implementation)
  - [Implement streaming](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation)
- [Implement Broker API](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement-broker-api/)

- [Create a custom indicator](https://www.tradingview.com/charting-library-docs/latest/tutorials/create-custom-indicator/)

- [Create custom page in Account Manager](https://www.tradingview.com/charting-library-docs/latest/tutorials/create-custom-page-in-account-manager)
- [Add custom button to top toolbar](https://www.tradingview.com/charting-library-docs/latest/tutorials/add-custom-button-to-top-toolbar)
- [Implement snapshots server](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement-snapshots-server)

- [Home page](https://www.tradingview.com/charting-library-docs/)
- [Connect data via Datafeed API](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/)
- Implement streaming

On this page

# Implement streaming

tip

This article is part of a tutorial about implementing Datafeed API.
We recommend that you follow the guide from the [start](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/).

At this stage, you will implement real-time data updates via WebSocket.
You will know how to:

- Connect to streaming and unsubscribe from it.
- Subscribe for data updates and handle them.

## Step 1. Connect to streaming [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#step-1-connect-to-streaming "Direct link to Step 1. Connect to streaming")

To connect your datafeed to the streaming API:

1. Import `apiKey` from [`helpers.js`](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Datafeed-Implementation#resolvesymbol) into `streaming.js`.



/chart‑project/src/streaming.js





```javascript
import { apiKey } from './helpers.js';
```

2. Create a new file called `streaming.js`, where you will implement a connection to WebSocket.



/chart‑project/src/streaming.js





```javascript
const socket = new WebSocket(
       'wss://streamer.cryptocompare.com/v2?api_key=' + apiKey
);

const channelToSubscription = new Map();

socket.addEventListener('open', () => {
       console.log('[socket] Connected');
});

socket.addEventListener('close', (reason) => {
       console.log('[socket] Disconnected:', reason);
});

socket.addEventListener('error', (error) => {
       console.log('[socket] Error:', error);
});

export function subscribeOnStream() {
       // To Do
}

export function unsubscribeFromStream() {
       // To Do
}
```

3. Import the functions from `streaming.js` into `datafeed.js`:



/chart‑project/src/datafeed.js





```javascript
import { subscribeOnStream, unsubscribeFromStream } from './streaming.js';
```

4. To subscribe for real-time data updates for a symbol, implement [`subscribeBars`](https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/required-methods#subscribebars).
The library calls it every time the chart symbol or resolution is changed,
or when the chart needs to subscribe to a new symbol.



/chart‑project/src/datafeed.js





```javascript
// ...
// Use it to keep a record of the most recent bar on the chart
const lastBarsCache = new Map();
// ...
export default {
       // ...
       subscribeBars: (
           symbolInfo,
           resolution,
           onRealtimeCallback,
           subscriberUID,
           onResetCacheNeededCallback,
       ) => {
           console.log('[subscribeBars]: Method call with subscriberUID:', subscriberUID);
           subscribeOnStream(
               symbolInfo,
               resolution,
               onRealtimeCallback,
               subscriberUID,
               onResetCacheNeededCallback,
               // Pass the last bar from cache if available
               lastBarsCache.get(symbolInfo.ticker)
           );
       },
};
```

5. Implement [`unsubscribeBars`](https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/required-methods#unsubscribebars) to stop receiving updates for the symbol when a user selects another symbol on the chart.



/chart‑project/src/datafeed.js





```javascript
unsubscribeBars: (subscriberUID) => {
       console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
       unsubscribeFromStream(subscriberUID);
},
```

6. When users switch between the resolutions, previously loaded data may conflict with the new one. In such cases, the [time violation](https://www.tradingview.com/charting-library-docs/latest/connecting_data/Datafeed-Issues#time-violation) issue occurs. To avoid it, you should reset cache when the resolution is changed.



/chart‑project/src/main.js





```javascript
// Wait for the chart to be ready
tvWidget.onChartReady(() => {
       console.log('Chart is ready');
       const chart = tvWidget.activeChart();

       // Subscribe to interval changes and then clear cache
       chart.onIntervalChanged().subscribe(null, () => {
           tvWidget.resetCache();
           chart.resetData();
       });
});
window.frames[0].focus();
```


## Step 2. Subscribe for updates [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#step-2-subscribe-for-updates "Direct link to Step 2. Subscribe for updates")

On the previous step, you connected your datafeed to WebSocket.
Now, you need to subscribe to the channels to receive updates:

1. Import `parseFullSymbol` from [`helpers.js`](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Datafeed-Implementation#resolvesymbol) into `streaming.js`.



/chart‑project/src/streaming.js





```javascript
import { parseFullSymbol, apiKey } from './helpers.js';
```

2. Implement `subscribeOnStream` to subscribe for updates.



/chart‑project/src/streaming.js





```javascript
// ...
const channelToSubscription = new Map();
// ...
export function subscribeOnStream(
       symbolInfo,
       resolution,
       onRealtimeCallback,
       subscriberUID,
       onResetCacheNeededCallback,
       lastBar
) {
       // Validate SymbolInfo
       if (!symbolInfo || !symbolInfo.ticker) {
           console.error('[subscribeBars]: Invalid symbolInfo:', symbolInfo);
           return;
       }
       const parsedSymbol = parseFullSymbol(symbolInfo.ticker);

       // Subscribe to the trade channel to build bars ourselves
       const channelString = `0~${parsedSymbol.exchange}~${parsedSymbol.fromSymbol}~${parsedSymbol.toSymbol}`;

       const handler = {
           id: subscriberUID,
           callback: onRealtimeCallback,
       };

       let subscriptionItem = channelToSubscription.get(channelString);
       if (subscriptionItem) {
           console.log('Updating existing subscription with new resolution:', resolution);
           subscriptionItem.resolution = resolution;
           subscriptionItem.lastBar = lastBar;
           subscriptionItem.handlers.push(handler);
           return;
       }

       subscriptionItem = {
           subscriberUID,
           resolution,
           lastBar,
           handlers: [handler],
       };

       channelToSubscription.set(channelString, subscriptionItem);
       console.log('[subscribeBars]: Subscribe to streaming. Channel:', channelString);

       const subRequest = {
           action: 'SubAdd',
           subs: [channelString],
       };
       console.log('[subscribeBars]: Sending subscription request:', subRequest);
       // Only send SubAdd if the socket is open
       if (socket.readyState === WebSocket.OPEN) {
           socket.send(JSON.stringify(subRequest));
       }
}
```


## Step 3. Unsubscribe from streaming [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#step-3-unsubscribe-from-streaming "Direct link to Step 3. Unsubscribe from streaming")

Implement `unsubscribeFromStream` to unsubscribe from streaming:

/chart‑project/src/streaming.js

```javascript
export function unsubscribeFromStream(subscriberUID) {
    for (const channelString of channelToSubscription.keys()) {
        const subscriptionItem = channelToSubscription.get(channelString);
        const handlerIndex = subscriptionItem.handlers.findIndex(
            (handler) => handler.id === subscriberUID
        );

        if (handlerIndex !== -1) {
            subscriptionItem.handlers.splice(handlerIndex, 1);

            if (subscriptionItem.handlers.length === 0) {
                console.log('[unsubscribeBars]: Unsubscribe from streaming. Channel:', channelString);
                const subRequest = {
                    action: 'SubRemove',
                    subs: [channelString],
                };
                socket.send(JSON.stringify(subRequest));
                channelToSubscription.delete(channelString);
                break;
            }
        }
    }
}
```

## Step 4. Handle updates [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#step-4-handle-updates "Direct link to Step 4. Handle updates")

The responses for requests look like this:

```javascript
TYPE:"0"
M:"Coinbase"
FSYM:"BTC"
TSYM:"USD"
F:"1"
ID:"852793745"
TS:1753190418
Q:0.34637342
P:119283.1
TOTAL:41316.495295202
RTS:1753190418
CCSEQ:852777369
TSNS:654000000
RTSNS:708000000
```

To handle updates coming from the WebSocket:

1. Implement the following function in `streaming.js`:



/chart‑project/src/streaming.js





```javascript
// ...
socket.addEventListener('message', (event) => {
       const data = JSON.parse(event.data);

       const {
           TYPE: eventType,
           M: exchange,
           FSYM: fromSymbol,
           TSYM: toSymbol,
           TS: tradeTime, // This is a UNIX timestamp in seconds
           P: tradePrice,
           Q: tradeVolume,
       } = data;

       // Handle Trade event updates only
       if (parseInt(eventType) !== 0) {
           return;
       }

       const channelString = `0~${exchange}~${fromSymbol}~${toSymbol}`;
       const subscriptionItem = channelToSubscription.get(channelString);

       if (subscriptionItem === undefined) {
           return;
       }

       const lastBar = subscriptionItem.lastBar;
       let bar = {
           ...lastBar,
           high: Math.max(lastBar.high, tradePrice),
           low: Math.min(lastBar.low, tradePrice),
           close: tradePrice,
       };
       subscriptionItem.lastBar = bar;

       // Send data to every subscriber of that symbol
       subscriptionItem.handlers.forEach((handler) => handler.callback(bar));
})
```

2. Adjust the [`getBars`](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Datafeed-Implementation#getbars) method in `datafeed.js` to save the last bar data for the current symbol.



/chart‑project/src/datafeed.js





```javascript
//...
data.Data.forEach( ... );
if (firstDataRequest) {
       lastBarsCache.set(symbolInfo.ticker, {
           ...bars[bars.length - 1],
       });
}
console.log(`[getBars]: returned ${bars.length} bar(s)`);
// ...
```

3. Add `getNextDailyBarTime` function to `streaming.js`.



/chart‑project/src/streaming.js





```javascript
// Calculates the start time of the bar based on the resolution
function getNextBarTime(barTime, resolution) {
       const date = new Date(barTime);
       const interval = parseInt(resolution);

       if (resolution === '1D') {
           date.setUTCDate(date.getUTCDate() + 1);
           date.setUTCHours(0, 0, 0, 0);
       } else if (!isNaN(interval)) { // Handles '1' and '60' (minutes)
           // Add the interval to the current bar's time
           date.setUTCMinutes(date.getUTCMinutes() + interval);
       }
       return date.getTime();
}
```









CryptoCompare API provides a streaming of ticks, not bars.
So, you need to check that the new trade is related to the new bar.

Note that you might need a more comprehensive check for the production version.

4. Adjust the `socket.addEventListener` listener in `streaming.js`.





```javascript
       socket.addEventListener('message', (event) => {
       // ...
       const lastBar = subscriptionItem.lastBar;

       // The resolution will be '1', '60', or '1D'
       const nextBarTime = getNextBarTime(lastBar.time, subscriptionItem.resolution);

       let bar;
       // If the trade time is greater than or equal to the next bar's start time, create a new bar
       if (tradeTime * 1000 >= nextBarTime) {
           bar = {
               time: nextBarTime,
               open: tradePrice,
               high: tradePrice,
               low: tradePrice,
               close: tradePrice,
               volume: tradeVolume,
           };
       } else {
           // Otherwise, update the last bar
           bar = {
               ...lastBar,
               high: Math.max(lastBar.high, tradePrice),
               low: Math.min(lastBar.low, tradePrice),
               close: tradePrice,
               volume: (lastBar.volume || 0) + tradeVolume,
           };
       }
       subscriptionItem.lastBar = bar;
       // ...
})
```


## Result [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#result "Direct link to Result")

🎉 Congrats!
At this point, you have implemented a datafeed with searching and resolving symbols, loading historical data,
and providing real-time data updates via WebSocket.

Now you can run `npx serve` from the `chart-project` folder (if you have not already done it before)
and check how the implementation works.

## Complete code [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#complete-code "Direct link to Complete code")

Click the following sections to reveal the complete code for the examples at this stage of the tutorial.

`index.html`

```html
<!DOCTYPE HTML>
<html>
    <head>
        <title>TradingView Advanced Charts example</title>

        <!-- The script that loads the library -->
        <script
            type="text/javascript"
            src="charting_library_cloned_data/charting_library/charting_library.js">
        </script>

        <!-- Custom datafeed module -->
        <script type="module" src="src/main.js"></script>
    </head>

    <body style="margin:0px;">
        <!-- A container for the the library widget -->
        <div id="tv_chart_container">
        </div>
    </body>
</html>
```

`datafeed.js`

```javascript
import { makeApiRequest, generateSymbol, parseFullSymbol } from './helpers.js';
import { subscribeOnStream, unsubscribeFromStream } from './streaming.js';

// Use a Map to store the last bar for each symbol subscription.
// This is essential for the streaming logic to update the chart correctly.
const lastBarsCache = new Map();

// DatafeedConfiguration implementation
const configurationData = {
    // Represents the resolutions for bars supported by your datafeed
    supported_resolutions: ['1', '5', '15', '60', '180', '1D', '1W', '1M'],
    // The `exchanges` arguments are used for the `searchSymbols` method if a user selects the exchange
    exchanges: [\
        { value: 'Bitfinex', name: 'Bitfinex', desc: 'Bitfinex'},\
        { value: 'Kraken', name: 'Kraken', desc: 'Kraken bitcoin exchange'},\
    ],
    // The `symbols_types` arguments are used for the `searchSymbols` method if a user selects this symbol type
    symbols_types: [\
        { name: 'crypto', value: 'crypto'}\
    ]
};

// Obtains all symbols for all exchanges supported by CryptoCompare API
async function getAllSymbols() {
    const data = await makeApiRequest('data/v3/all/exchanges');
    let allSymbols = [];

    for (const exchange of configurationData.exchanges) {
        if (data.Data[exchange.value]) {
            const pairs = data.Data[exchange.value].pairs;

            for (const leftPairPart of Object.keys(pairs)) {
                const symbols = pairs[leftPairPart].map(rightPairPart => {
                    const symbol = generateSymbol(exchange.value, leftPairPart, rightPairPart);
                    return {
                        symbol: symbol.short,
                        ticker: symbol.full,
                        description: symbol.short,
                        exchange: exchange.value,
                        type: 'crypto'
                    };
                });
                allSymbols = [...allSymbols, ...symbols];
            }
        }
    }
    return allSymbols;
}

export default {
    onReady: (callback) => {
        console.log('[onReady]: Method call');
        setTimeout(() => callback(configurationData));
    },

    searchSymbols: async (
        userInput,
        exchange,
        symbolType,
        onResultReadyCallback,
    ) => {
        console.log('[searchSymbols]: Method call');
        const symbols = await getAllSymbols();
        const newSymbols = symbols.filter(symbol => {
            const isExchangeValid = exchange === '' || symbol.exchange === exchange;
            const isFullSymbolContainsInput = symbol.ticker
                .toLowerCase()
                .indexOf(userInput.toLowerCase()) !== -1;
            return isExchangeValid && isFullSymbolContainsInput;
        });
        onResultReadyCallback(newSymbols);
    },

    resolveSymbol: async (
        symbolName,
        onSymbolResolvedCallback,
        onResolveErrorCallback,
        extension
    ) => {
        console.log('[resolveSymbol]: Method call', symbolName);
        const symbols = await getAllSymbols();
        const symbolItem = symbols.find(({
            ticker,
        }) => ticker === symbolName);
        if (!symbolItem) {
            console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
            onResolveErrorCallback("unknown_symbol"); // Displays the ghost icon
            return;
        }
        // Symbol information object
        const symbolInfo = {
            ticker: symbolItem.ticker,
            name: symbolItem.symbol,
            description: symbolItem.description,
            type: symbolItem.type,
            exchange: symbolItem.exchange,
            listed_exchange: symbolItem.exchange,
            session: '24x7',
            timezone: 'Etc/UTC',
            minmov: 1,
            pricescale: 10000,
            has_intraday: true,
            intraday_multipliers: ["1", "60"],
            has_daily: true,
            daily_multipliers: ["1"],
            visible_plots_set: "ohlcv",
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };

        console.log('[resolveSymbol]: Symbol resolved', symbolName);
        onSymbolResolvedCallback(symbolInfo);
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        const { from, to, firstDataRequest } = periodParams;
        console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
        const parsedSymbol = parseFullSymbol(symbolInfo.ticker);

        let endpoint;
        // Determine the correct endpoint based on the resolution requested by the library
        if (resolution === '1D') {
            endpoint = 'histoday';
        } else if (resolution === '60') {
            endpoint = 'histohour';
        } else if (resolution === '1') {
            endpoint = 'histominute';
        } else {
            onErrorCallback(`Invalid resolution: ${resolution}`);
            return;
        }

        const urlParameters = {
            e: parsedSymbol.exchange,
            fsym: parsedSymbol.fromSymbol,
            tsym: parsedSymbol.toSymbol,
            toTs: to,
            limit: 2000,
        };

        // Example of historical OHLC 5 minute data request:
        // https://min-api.cryptocompare.com/data/v2/histominute?fsym=ETH&tsym=USDT&limit=10&e=Binance&api_key="API_KEY"
        const query = Object.keys(urlParameters)
            .map(name => `${name}=${encodeURIComponent(urlParameters[name])}`)
            .join('&');

        try {
            const data = await makeApiRequest(`data/v2/${endpoint}?${query}`);
            if ((data.Response && data.Response === 'Error') || !data.Data || !data.Data.Data || data.Data.Data.length === 0) {
                // "noData" should be set if there is no data in the requested period
                onHistoryCallback([], { noData: true });
                return;
            }

            let bars = [];
            data.Data.Data.forEach(bar => {
                if (bar.time >= from && bar.time < to) {
                    bars.push({
                        time: bar.time * 1000,
                        low: bar.low,
                        high: bar.high,
                        open: bar.open,
                        close: bar.close,
                        volume: bar.volumefrom,
                    });
                }
            });

            if (firstDataRequest) {
                lastBarsCache.set(symbolInfo.ticker, { ...bars[bars.length - 1] });
            }
            console.log(`[getBars]: returned ${bars.length} bar(s)`);
            onHistoryCallback(bars, { noData: false });
        } catch (error) {
            console.log('[getBars]: Get error', error);
            onErrorCallback(error);
        }
    },

    subscribeBars: (
        symbolInfo,
        resolution,
        onRealtimeCallback,
        subscriberUID,
        onResetCacheNeededCallback,
    ) => {
        console.log('[subscribeBars]: Method call with subscriberUID:', subscriberUID);
        subscribeOnStream(
            symbolInfo,
            resolution,
            onRealtimeCallback,
            subscriberUID,
            onResetCacheNeededCallback,
            // Pass the last bar from cache if available
            lastBarsCache.get(symbolInfo.ticker)
        );
    },

    unsubscribeBars: (subscriberUID) => {
        console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
        unsubscribeFromStream(subscriberUID);
    },
};
```

`streaming.js`

```javascript
import { parseFullSymbol, apiKey } from './helpers.js';

const socket = new WebSocket(
    'wss://streamer.cryptocompare.com/v2?api_key=' + apiKey
);
// Example ▼ {"TYPE":"20","MESSAGE":"STREAMERWELCOME","SERVER_UPTIME_SECONDS":1262462,"SERVER_NAME":"08","SERVER_TIME_MS":1753184197855,"CLIENT_ID":2561280,"DATA_FORMAT":"JSON","SOCKET_ID":"7zUlXfWU+zH7uX7ViDS2","SOCKETS_ACTIVE":1,"SOCKETS_REMAINING":0,"RATELIMIT_MAX_SECOND":30,"RATELIMIT_MAX_MINUTE":60,"RATELIMIT_MAX_HOUR":1200,"RATELIMIT_MAX_DAY":10000,"RATELIMIT_MAX_MONTH":20000,"RATELIMIT_REMAINING_SECOND":29,"RATELIMIT_REMAINING_MINUTE":59,"RATELIMIT_REMAINING_HOUR":1199,"RATELIMIT_REMAINING_DAY":9999,"RATELIMIT_REMAINING_MONTH":19867}

const channelToSubscription = new Map();

socket.addEventListener('open', () => {
    console.log('[socket] Connected');
});

socket.addEventListener('close', (reason) => {
    console.log('[socket] Disconnected:', reason);
});

socket.addEventListener('error', (error) => {
    console.log('[socket] Error:', error);
});

// Calculates the start time of the bar based on the resolution
function getNextBarTime(barTime, resolution) {
    const date = new Date(barTime);
    const interval = parseInt(resolution);

    if (resolution === '1D') {
        date.setUTCDate(date.getUTCDate() + 1);
        date.setUTCHours(0, 0, 0, 0);
    } else if (!isNaN(interval)) { // Handles '1' and '60' (minutes)
        // Add the interval to the current bar's time
        date.setUTCMinutes(date.getUTCMinutes() + interval);
    }
    return date.getTime();
}

socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    const {
        TYPE: eventType,
        M: exchange,
        FSYM: fromSymbol,
        TSYM: toSymbol,
        TS: tradeTime, // This is a UNIX timestamp in seconds
        P: tradePrice,
        Q: tradeVolume,
    } = data;

    // Handle Trade event updates only
    if (parseInt(eventType) !== 0) {
        return;
    }

    const channelString = `0~${exchange}~${fromSymbol}~${toSymbol}`;
    const subscriptionItem = channelToSubscription.get(channelString);

    if (subscriptionItem === undefined) {
        return;
    }

    const lastBar = subscriptionItem.lastBar;

    // The resolution will be '1', '60', or '1D'
    const nextBarTime = getNextBarTime(lastBar.time, subscriptionItem.resolution);

    let bar;
    // If the trade time is greater than or equal to the next bar's start time, create a new bar
    if (tradeTime * 1000 >= nextBarTime) {
        bar = {
            time: nextBarTime,
            open: tradePrice,
            high: tradePrice,
            low: tradePrice,
            close: tradePrice,
            volume: tradeVolume,
        };
    } else {
        // Otherwise, update the last bar
        bar = {
            ...lastBar,
            high: Math.max(lastBar.high, tradePrice),
            low: Math.min(lastBar.low, tradePrice),
            close: tradePrice,
            volume: (lastBar.volume || 0) + tradeVolume,
        };
    }
    subscriptionItem.lastBar = bar;

    // Send data to every subscriber of that symbol
    subscriptionItem.handlers.forEach((handler) => handler.callback(bar));
})

export function subscribeOnStream(
    symbolInfo,
    resolution,
    onRealtimeCallback,
    subscriberUID,
    onResetCacheNeededCallback,
    lastBar
) {
    // Validate SymbolInfo
    if (!symbolInfo || !symbolInfo.ticker) {
        console.error('[subscribeBars]: Invalid symbolInfo:', symbolInfo);
        return;
    }
    const parsedSymbol = parseFullSymbol(symbolInfo.ticker);

    // Subscribe to the trade channel to build bars ourselves
    const channelString = `0~${parsedSymbol.exchange}~${parsedSymbol.fromSymbol}~${parsedSymbol.toSymbol}`;

    const handler = {
        id: subscriberUID,
        callback: onRealtimeCallback,
    };

    let subscriptionItem = channelToSubscription.get(channelString);
    if (subscriptionItem) {
        console.log('Updating existing subscription with new resolution:', resolution);
        subscriptionItem.resolution = resolution;
        subscriptionItem.lastBar = lastBar;
        subscriptionItem.handlers.push(handler);
        return;
    }

    subscriptionItem = {
        subscriberUID,
        resolution,
        lastBar,
        handlers: [handler],
    };

    channelToSubscription.set(channelString, subscriptionItem);
    console.log('[subscribeBars]: Subscribe to streaming. Channel:', channelString);

    const subRequest = {
        action: 'SubAdd',
        subs: [channelString],
    };
    console.log('[subscribeBars]: Sending subscription request:', subRequest);
    // Only send SubAdd if the socket is open
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(subRequest));
    }
}

export function unsubscribeFromStream(subscriberUID) {
    for (const channelString of channelToSubscription.keys()) {
        const subscriptionItem = channelToSubscription.get(channelString);
        const handlerIndex = subscriptionItem.handlers.findIndex(
            (handler) => handler.id === subscriberUID
        );

        if (handlerIndex !== -1) {
            subscriptionItem.handlers.splice(handlerIndex, 1);

            if (subscriptionItem.handlers.length === 0) {
                console.log('[unsubscribeBars]: Unsubscribe from streaming. Channel:', channelString);
                const subRequest = {
                    action: 'SubRemove',
                    subs: [channelString],
                };
                socket.send(JSON.stringify(subRequest));
                channelToSubscription.delete(channelString);
                break;
            }
        }
    }
}
```

## What's next? [​](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/\#whats-next "Direct link to What's next?")

We hope this tutorial helped you understand the essentials of the [Datafeed API](https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/) and how to work with it.
If you want to dive deeper into the details, we recommend checking out the following articles:

- [Widget Constructor](https://www.tradingview.com/charting-library-docs/latest/core_concepts/Widget-Constructor): get a better understanding of the Widget Constructor's capabilities and settings.
- [Datafeed Common Issues](https://www.tradingview.com/charting-library-docs/latest/connecting_data/Datafeed-Issues): explore common issues that you might face when implementing the Datafeed API.
- [Customization Overview](https://www.tradingview.com/charting-library-docs/latest/customization/): learn how to customize UI elements and chart behavior.

[Previous\\
\\
Implement datafeed](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Datafeed-Implementation) [Next\\
\\
Implement Broker API](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement-broker-api/)

- [Step 1. Connect to streaming](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#step-1-connect-to-streaming)
- [Step 2. Subscribe for updates](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#step-2-subscribe-for-updates)
- [Step 3. Unsubscribe from streaming](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#step-3-unsubscribe-from-streaming)
- [Step 4. Handle updates](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#step-4-handle-updates)
- [Result](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#result)
- [Complete code](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#complete-code)
- [What's next?](https://www.tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/Streaming-Implementation/#whats-next)

Community

- [GitHub Issues 🔐](https://github.com/tradingview/charting_library/issues)

Demos

- [Advanced Charts](https://charting-library.tradingview-widget.com/)
- [Trading Platform](https://trading-terminal.tradingview-widget.com/)

More

- [Lightweight Charts™️](https://www.tradingview.com/lightweight-charts/)
- [TradingView Widgets](https://www.tradingview.com/widget/)

Copyright © 2025 TradingView, Inc. Built with Docusaurus.