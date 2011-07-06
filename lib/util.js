var crypto = require('crypto');

var hashPassword = exports.hashPassword = function (password) {
  return crypto.createHash('sha1', conf.passwordKey)
  .update(password).update(conf.passwordSalt).digest('base64');
}
,randomBin = exports.randomBin = function (length, pre, post) {
  pre = pre || '';
  post = post || '';
  var buf = new Buffer(length+pre.length+post.length)
  ,i = pre.length;
  buf.write(pre);
  for (;i < length; i++) {
    buf[i] = Math.round(Math.random()*255);
  }
  buf.write(post, i);
  return buf;
}
,encodeBase64Url = exports.encodeBase64Url = function (buf) {
  return buf.toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}
,decodeBase64Url = exports.decodeBase64Url = function (str) {
  return new Buffer(str.replace(/_/g, '/').replace(/-/g, '+'), 'base64');
}
,generateRefreshToken = exports.generateRefreshToken = function () {
    return encodeBase64Url(randomBin(32, '1/'));
}
,generateAccessToken = exports.generateAccessToken = function () {
    return encodeBase64Url(randomBin(16, '1/'));
};

