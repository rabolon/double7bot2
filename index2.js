// Colors the sell/buy prices, last version with simulated orders

// Modules
const api = require('./api');
const express = require('express');
const path = require('path');
const tulind = require('tulind');

// Global variables
let dataPlot = {
  openTime: [],
  open: [],
  high: [],
  low: [],
  close: [],
  volume: [],
  bBands: [[], [], []],
  prices: [],
  pricesColor: []
};

let firstTime = true;
const allocation = 0.00025;
let status = 'INIT';
let sellQty = 0;
let buyQty = 0;
let assetQty = 0;
let assetQtyInit = 0;
let baseQty = 0;
let baseQtyInit = 0;

let lastIndex;
let initPrice = 0;
let lastPrice = 0;
const bbandsLength = 30;
const stdDeviations = 1;
let tick = 1;
let intiTime = new Date().getTime();
const asset = 'BTC';
const base = 'USDT';


// Express Server configuration
const app = express();
app.use(express.static('public'));

setInterval(run, 2000);

// main
async function run() {
  //  fill dataPlot
  if (firstTime) {

    let endTime = new Date().getTime();
    endTime = endTime - endTime % 60000;      // let complete the candle
    let startTime = endTime - (12 * 3600 * 1000);

    const klines = await api.candleStickData(asset + base, '1m', startTime, endTime, 1000);
    dataPlot.openTime = klines.map(value => value[0]);
    dataPlot.open = klines.map(value => value[1]);
    dataPlot.high = klines.map(value => value[2]);
    dataPlot.low = klines.map(value => value[3]);
    dataPlot.close = klines.map(value => value[4]);
    dataPlot.volume = klines.map(value => value[5]);
    dataPlot.bBands = await tulind.indicators.bbands.indicator([dataPlot.close], [bbandsLength, stdDeviations]);
    // completes the bBands length with NaN
    let pad = new Array(bbandsLength - 1).fill(NaN);
    dataPlot.bBands[0].unshift(...(pad));
    dataPlot.bBands[1].unshift(...(pad));
    dataPlot.bBands[2].unshift(...(pad));


    //console.log(dataPlot.bBands[0], dataPlot.openTime);

    lastIndex = dataPlot.openTime.length - 1;

    dataPlot.prices.length = lastIndex + 1;
    dataPlot.prices.fill(NaN);
    dataPlot.pricesColor = [...dataPlot.prices];

    let account = await api.accountInformation(null);
    assetQtyInit = parseFloat(account.balances.find(value => value.asset == asset).free);
    baseQtyInit = parseFloat(account.balances.find(value => value.asset == base).free);
    assetQty = assetQtyInit;
    baseQty = baseQtyInit;

    initPrice = parseFloat(dataPlot.close[lastIndex]);
    firstTime = false;
  }
  // shift dataPlot every minute
  else {
    const newKline = await api.candleStickData(asset + base, '1m', null, null, 2);
    if (newKline[0][0] > dataPlot.openTime[lastIndex]) {
      dataPlot.openTime.shift();
      dataPlot.open.shift();
      dataPlot.high.shift();
      dataPlot.low.shift();
      dataPlot.close.shift();
      dataPlot.volume.shift();

      dataPlot.openTime.push(newKline[0][0]);
      dataPlot.open.push(newKline[0][1]);
      dataPlot.high.push(newKline[0][2]);
      dataPlot.low.push(newKline[0][3]);
      dataPlot.close.push(newKline[0][4]);
      dataPlot.volume.push(newKline[0][5]);

      let pad = await tulind.indicators.bbands.indicator([dataPlot.close.slice(-bbandsLength)], [bbandsLength, stdDeviations]);
      dataPlot.bBands[0].shift();
      dataPlot.bBands[1].shift();
      dataPlot.bBands[2].shift();
      dataPlot.bBands[0].push(...pad[0]);
      dataPlot.bBands[1].push(...pad[1]);
      dataPlot.bBands[2].push(...pad[2]);

      dataPlot.prices.shift();
      dataPlot.prices.push(NaN);
      dataPlot.pricesColor.shift();
      dataPlot.pricesColor.push(NaN);

      lastPrice = dataPlot.close[lastIndex];
    }

    // each one tick
    // let account = await api.accountInformation(null);
    // assetQty = parseFloat(account.balances.find(value => value.asset == asset).free);
    // baseQty = parseFloat(account.balances.find(value => value.asset == base).free);

    const ticker = await api.symbolPriceTicker(asset + base);
    let price = parseFloat(ticker.price);

    double7(price);
    
    const now = new Date().getTime();
    const elapsed = now - intiTime;

    // get wallet



    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`${msToTime(elapsed)}, BB: ${stdDeviations}-${bbandsLength}, Status: ${status}, Sells: ${sellQty}, Buys: ${buyQty}`);
    console.log(`Init price: ${initPrice.toFixed(2)}, Tick price: ${price.toFixed(2)}`);
    console.log(`Asset: ${assetQtyInit.toFixed(7)}/${assetQty.toFixed(7)}, Base: ${baseQtyInit.toFixed(2)}/${baseQty.toFixed(2)}, Profit: ${((assetQty - assetQtyInit)* price + (baseQty - baseQtyInit)).toFixed(2)}`);
    console.log('Estimated fees: ', ((sellQty + buyQty) * allocation * price * 0.00075).toFixed(2));
  }
}

// Functions 

// Bot
function double7(price) {
  if (price > dataPlot.bBands[2][lastIndex] && (status == 'SELL' || status == 'INIT')) {
    status = 'BUY';
    sellQty++;
    assetQty = assetQty - allocation;
    dataPlot.prices[lastIndex] = price;
    dataPlot.pricesColor[lastIndex] = 'red';
    baseQty = baseQty + allocation * price;
  }
  else if (price < dataPlot.bBands[0][lastIndex] && (status == 'BUY' || status == 'INIT')) {
    status = 'SELL';
    buyQty++;
    assetQty = assetQty + allocation;
    dataPlot.prices[lastIndex] = price;
    dataPlot.pricesColor[lastIndex] = 'green';
    baseQty = baseQty - allocation * price;
  }
  else if (price < dataPlot.bBands[1][lastIndex] && (status == 'BUY')) {
    status = 'INIT';
  }
  else if (price > dataPlot.bBands[1][lastIndex] && (status == 'SELL')) {
    status = 'INIT';
  }

}


app.use('/data', (req, res) => {
  res.json(dataPlot);
})

app.listen(process.env.PORT, () => {
  console.log('App funcionando bien');
})

function msToTime(duration) {
  let seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;

  return hours + ":" + minutes + ":" + seconds;
}