// Bot with real orders

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

let assetAccu = 0;
let assetSellQty = 0;
let assetBuyQty = 0;
let assetBalanceInitial = 0;
let assetBalance = 0;

let baseAccu = 0;
let baseBalanceInitial = 0;
let baseBalance = 0;

let limitImbalance = 5;
let fees = 0;

let lastIndex;
let initPrice = 0;
let lastPrice = 0;
const bbandsLength = 30;
const stdDeviations = 3;
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
    assetBalanceInitial = parseFloat(account.balances.find(value => value.asset == asset).free);
    baseBalanceInitial = parseFloat(account.balances.find(value => value.asset == base).free);
    assetBalance = assetBalanceInitial;
    baseBalance = baseBalanceInitial;

    initPrice = parseFloat(dataPlot.close[lastIndex]);
    firstTime = false;
  }
  // each one tick
  else {
    const newKline = await api.candleStickData(asset + base, '1m', null, null, 2);
    if (newKline[0][0] > dataPlot.openTime[lastIndex]) {       // shift dataPlot every minute aproximately
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

    let account = await api.accountInformation(null);
    assetBalance = parseFloat(account.balances.find(value => value.asset == asset).free);
    baseBalance = parseFloat(account.balances.find(value => value.asset == base).free);

    const ticker = await api.symbolPriceTicker(asset + base);
    let price = parseFloat(ticker.price);

    double7(price);

    const now = new Date().getTime();
    const elapsed = now - intiTime;

    console.log(`-----------------------------------------------------------------------------------`);
    console.log(`${msToTime(elapsed)}, Market: ${asset + base}, BB: ${stdDeviations}-${bbandsLength}, Status: ${status}, Sells: ${assetSellQty}, Buys: ${assetBuyQty}`);
    console.log(`Allocation: ${allocation}, Limit imbalance: ${limitImbalance}, Init price: ${initPrice.toFixed(2)}, Tick price: ${price.toFixed(2)}`);
    // console.log(`Asset: ${assetQtyInit.toFixed(7)}/${assetQty.toFixed(7)}, Base: ${baseQtyInit.toFixed(2)}/${baseQty.toFixed(2)}, Profit: ${((assetQty - assetQtyInit)* price + (baseQty - baseQtyInit)).toFixed(2)}`);
    console.log(`Balance -> ${asset}: ${assetBalanceInitial.toFixed(7)}/${assetBalance.toFixed(7)}, ${base}: ${baseBalanceInitial.toFixed(2)}/${baseBalance.toFixed(2)}, Profit: ${((assetBalance - assetBalanceInitial) * price + (baseBalance - baseBalanceInitial)).toFixed(2)}, Fees: ${fees}`);
    console.log(`Bot -> ${asset}: ${assetAccu}, ${base}: ${baseAccu}, Profit: ${(assetAccu * price + baseAccu).toFixed(2)}, Fees: ${((assetSellQty + assetBuyQty) * allocation * price * 0.00075).toFixed(2)}`);

    if (Math.abs(assetSellQty-assetBuyQty) > limitImbalance) {
      console.log(`Maximum imbalance between sells and Buys exceeded: ${limitImbalance}`);
      process.exit(0);
    }


  }
}

// Functions 

// Bot
async function double7(price) {
  if (price > dataPlot.bBands[2][lastIndex] && (status == 'SELL' || status == 'INIT')) {
    let order = await api.newOrder(asset + base, allocation, null, 'SELL', 'MARKET', null);
    if (order.status == 'FILLED') {
      let sellPrice = parseFloat(order.fills[0].price);
      let commission = parseFloat(order.fills[0].commission);
      assetSellQty++;
      assetAccu = assetAccu - allocation;
      baseAccu = baseAccu + allocation * sellPrice;
      dataPlot.prices[lastIndex] = sellPrice;
      dataPlot.pricesColor[lastIndex] = 'red';
      fees = fees + commission;
      status = 'BUY';
    }
  }
  else if (price < dataPlot.bBands[0][lastIndex] && (status == 'BUY' || status == 'INIT')) {
    let order = await api.newOrder(asset + base, allocation, null, 'BUY', 'MARKET', null);
    if (order.status == 'FILLED') {
      let buyPrice = parseFloat(order.fills[0].price);
      let commission = parseFloat(order.fills[0].commission);
      assetBuyQty++;
      assetAccu = assetAccu + allocation;
      baseAccu = baseAccu - allocation * buyPrice;
      dataPlot.prices[lastIndex] = buyPrice;
      dataPlot.pricesColor[lastIndex] = 'green';
      fees = fees + commission * buyPrice;
      status = 'SELL';
    }
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