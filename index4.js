// fees in BNB
const version = '1.00';
'use strict';

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
const allocation = 0.001;
let status = 'INIT';

const asset = 'BTC';
const base = 'USDT';
const bnb = 'BNB';

let assetAccu = 0;
let assetSellQty = 0;
let assetBuyQty = 0;
let assetBalanceInitial = 0;
let assetBalance = 0;

let baseAccu = 0;
let baseBalanceInitial = 0;
let baseBalance = 0;

let bnbAccu = 0;
let bnbBalanceInitial = 0;
let bnbBalance = 0;

let imbalance = 4;
let fees = 0;

let lastIndex;
let initPrice = 0;
let lastPrice = 0;
const bbandsLength = 20;
const stdDeviations = 3;
let intiTime = new Date().getTime();

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
    bnbBalanceInitial = parseFloat(account.balances.find(value => value.asset == bnb).free);
    assetBalance = assetBalanceInitial;
    baseBalance = baseBalanceInitial;
    bnbBalance = bnbBalanceInitial;

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
    bnbBalance = parseFloat(account.balances.find(value => value.asset == bnb).free);

    let ticker = await api.symbolPriceTicker(asset + base);
    let price = parseFloat(ticker.price);
    ticker = await api.symbolPriceTicker(bnb + base);
    let bnbPrice = parseFloat(ticker.price);

    double7(price, bnbPrice);

    const now = new Date().getTime();
    const elapsed = now - intiTime;

    console.log(`-------------------------------------------------------------------------------------------------------------------`);
    console.log(`${msToTime(elapsed)}, Bot version: ${version}, Market: ${asset + base}, BB: ${stdDeviations}-${bbandsLength}, Allocation: ${allocation.toFixed(8)} now ${(allocation * price).toFixed(2)}, Limit imbalance: ${imbalance}`);
    console.log(`Status: ${status}, Sells: ${assetSellQty}, Buys: ${assetBuyQty}, ${asset + base} init: ${initPrice.toFixed(2)}, ${asset + base}: ${price.toFixed(2)}, ${bnb + base}: ${bnbPrice.toFixed(2)}`);
    console.log(`Balance spot -> ${asset}: ${assetBalanceInitial.toFixed(8)}/${assetBalance.toFixed(8)}, ${base}: ${baseBalanceInitial.toFixed(2)}/${baseBalance.toFixed(2)}, ${bnb}: ${bnbBalanceInitial.toFixed(8)}/${bnbBalance.toFixed(8)}, Profit: ${((assetBalance - assetBalanceInitial) * price + (baseBalance - baseBalanceInitial) + (bnbBalance - bnbBalanceInitial) * bnbPrice).toFixed(2)}`);
    console.log(`Balance bot -> ${asset}: ${assetAccu.toFixed(8)}, ${base}: ${baseAccu.toFixed(2)}, ${bnb}: ${bnbAccu.toFixed(8)}, Profit: ${(assetAccu * price + bnbAccu * bnbPrice + baseAccu).toFixed(2)}, Fees est.: ${((assetSellQty + assetBuyQty) * allocation * price * 0.00075).toFixed(2)}, Fees calc.: ${fees.toFixed(2)}`);
  }
}

// Functions 

// Bot
async function double7(price, bnbPrice) {
  if ((price > dataPlot.bBands[2][lastIndex]) && (status == 'SELL' || status == 'INIT') && ((assetSellQty-assetBuyQty) <= imbalance)) {
    let order = await api.newOrder(asset + base, allocation, null, 'SELL', 'MARKET', null);
    if (order.status == 'FILLED') {
      let sellPrice = parseFloat(order.fills[0].price);
      let commission = parseFloat(order.fills[0].commission);
      assetSellQty++;
      assetAccu = assetAccu - allocation;
      baseAccu = baseAccu + allocation * sellPrice;
      dataPlot.prices[lastIndex] = sellPrice;
      dataPlot.pricesColor[lastIndex] = 'red';
      bnbAccu = bnbAccu - commission;
      fees = fees + commission * bnbPrice;
      status = 'BUY';
    }
  }
  else if (price < dataPlot.bBands[0][lastIndex] && (status == 'BUY' || status == 'INIT') && ((assetBuyQty-assetSellQty) <= imbalance)) {
    let order = await api.newOrder(asset + base, allocation, null, 'BUY', 'MARKET', null);
    if (order.status == 'FILLED') {
      let buyPrice = parseFloat(order.fills[0].price);
      let commission = parseFloat(order.fills[0].commission);
      assetBuyQty++;
      assetAccu = assetAccu + allocation;
      baseAccu = baseAccu - allocation * buyPrice;
      dataPlot.prices[lastIndex] = buyPrice;
      dataPlot.pricesColor[lastIndex] = 'green';
      bnbAccu = bnbAccu - commission;
      fees = fees + commission * bnbPrice;
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
  console.log(`Server active in localhost:${process.env.PORT}`);
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