var url = require('url')
,crypto = require('crypto');

const verifierSet = 'abcdefghijklmnopqrstuvwxyz0123456789';

var paramEncode = function (data) {
  return data
    ? encodeURIComponent(data).replace(/\!/g, '%21').replace(/\'/g, '%27')
      .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A')
    : '';
}
,paramDecode = function (data) {
  return data ? decodeURIComponent(data.replace(/\+/g, ' ')) : '';
}

,normalizeRequestParameters = function (params) {
  var list = [];
  for (var i in params) {
    if (i !== 'oauth_signature' && i !== 'realm')
      list.push(i+'='+params[i]);
  }
  return list.sort(function(a, b) {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }).join('&');
}
,constructRequestUrl = function (url_) {
  url_ = url.parse(url_);
  return url_.protocol+'//'+url_.hostname
    +((url_.protocol === 'https:' && url_.port === '443')
      || (url_.protocol === 'http:' && url_.port === '80')
      ? '' : ':'+url_.port)
    +url_.pathname;
}
,signature = function (opt) {
  var text = opt.method.toUpperCase()
    +'&'+paramEncode(constructRequestUrl(opt.url))
    +'&'+paramEncode(normalizeRequestParameters(opt.params))
  ,key = paramEncode(opt.consumerSecret || 'anonymous')
    +'&'+paramEncode(opt.tokenSecret);
  if (opt.type === 'HMAC-SHA1')
    return crypto.createHmac('sha1', key).update(text).digest('base64');
}

,generateVerifier = function (size) {
  var size = size || 20
  ,verifier = new Array(size);
  for (var i = 0; i < size; i++) {
    verifier[i] = verifierSet[Math.floor(Math.random()*verifierSet.length)];
  }
  return verifier.join('');
}
,createToken = function (key, text) {
  var key_ = crypto.createHmac('sha1', key).update(Date.now().toString()).digest('base64')
    .replace(/\=/g, '.').replace(/\//g, '-').replace(/\+/g, '_')
  ,secret = crypto.createHmac('sha256', key_).update(text).digest('base64')
    .replace(/\=/g, '.').replace(/\//g, '-').replace(/\+/g, '_')
  return {key:key_, secret:secret};
}
,createRequestToken = function (opt) {
  var token = createToken(opt.nonce, opt.consumerSecret+opt.signature);
  token.verifier = generateVerifier();
  return token;
}
,createAccessToken = function (opt) {
  return createToken(opt.consumerSecret
    ,opt.consumerKey/*name?*/+opt.requestSecret+opt.consumerCallbackUrl
    ,algorithm);
};

//var Token = function (opt) {
//  this.key = opt.key;
//  this.secret = opt.secret;
//  this.verifier = opt.verifier || null;
//  this.authorized = opt.authorized || false;
//};
//
//Token.prototype = {
//  paramEncode: function () {
//    return 'oauth_token='+this.key+'&oauth_token_secret='+this.secret;
//  }
//};
//
//var requestToken = function (opt, callback) {
//  // {consumerKey, nonce, signatureMethod, signature, timestamp, callbackUrl} = opt
//  callback(err, token);
//};  
//    
//var accessToken = function (opt, callback) {
//  // {consumerKey, token, verifier, signatureMethod, signature, timestamp, nonce} = opt
//  callback(err, token);
//};

exports.createRequestToken = createRequestToken;
exports.createAccessToken = createAccessToken;
