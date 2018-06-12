var express = require('express');
var http = require('http');
var https = require('https');
var CronJob = require('cron').CronJob;
var fs = require('fs');
var priceHistory = require('./data.json');

var app     = express();
var server  = app.listen(3000);


const MAX_CHANGE_PER_HOUR = 0.000262707; //compounds to 10x/yr or 0.1x/yr maximum
const EXCHANGE_DATA_REQUEST_HOST = "api.coinmarketcap.com";
const EXCHANGE_DATA_REQUEST_PATH = "/v1/ticker/bolt/";

//Takes the exchange price provided, generates a new app price, and updates the app price history.
function updatePrices(exchangePrice){
    if(priceHistory.length>23){
      priceHistory.pop(); //oldest price (24 hours old) remove from history
    }
    lastPrice = 1.0 //bootstrap data if priceHistory is empty.
    if(priceHistory.length>0){
    	lastPrice = priceHistory[0];
    }
    var newPrice = exchangePrice; //default if exchange price is not too high or too low.

    if(lastPrice * (1+MAX_CHANGE_PER_HOUR) < exchangePrice){ //exhcange price too high, limit.
    	newPrice = lastPrice * (1+MAX_CHANGE_PER_HOUR);
    }else if(lastPrice * (1-MAX_CHANGE_PER_HOUR) > exchangePrice){ //exhcange price too low, limit.
    	newPrice = lastPrice * (1-MAX_CHANGE_PER_HOUR);
    }
    
    priceHistory.unshift(newPrice);

    fs.writeFile('./data.json',JSON.stringify(priceHistory),function(err){
    	return console.log(err);
    });
}

//Every 1 hour, fetch Bolt's exchange price from coinmarketcap (if available) and update the app price.
var priceUpdateJob = new CronJob('00 00 * * * *', function() {
  var request = https.request({
    hostname: EXCHANGE_DATA_REQUEST_HOST,
    path: EXCHANGE_DATA_REQUEST_PATH,
    port:443,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  },function(response){
  	var output = '';
  	console.log(EXCHANGE_DATA_REQUEST_HOST+ ':' + response.statusCode);
  	response.setEncoding('utf8');

  	response.on('data', function (chunk) {
       output += chunk;
  	});
  	response.on('end', function() {
        if(response.statusCode == 200){
        	//update price
	        var obj = JSON.parse(output);
	        updatePrices(obj[0]["price_usd"]);
	    }else{
	    	//dont change the new price
  			updatePrices(priceHistory[0]);
	    }
    });
  });

  request.on("error",function(e){
  	console.log('problem with request: ' + e.message);
  	console.log(e);
  	//dont change the new price
  	updatePrices(priceHistory[0]);
  });

  request.end();

}, null, true, 'America/Los_Angeles');

//Respond with the current app price.
app.get('/price', function(request, response) {
	response.setHeader('Content-Type', 'application/json');
    response.send(JSON.stringify({ price: priceHistory[0] }));
});

//Respond with the app price history.
app.get('/24h-prices', function(request, response) {
	response.setHeader('Content-Type', 'application/json');
    response.send(JSON.stringify({ priceHistory: priceHistory }));
});