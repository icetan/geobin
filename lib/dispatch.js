var reCache = {}
,match = 
exports.match = function (str, handlers, res, fn) {
  if (typeof res === 'function') {
    fn = res;
    res = reCache; 
  }
  for (var i in handlers) {
    if (!res[i]) res[i] = new RegExp(i);
    var m = res[i].exec(str);
    if (m) {
      fn(handlers[i], m.splice(1));
    }
  }
}
,route = 
exports.route = function (key, handlers, fn, otherwise) {
  if (key in handlers) {
    fn(handlers[key]);
  } else if (otherwise) {
    otherwise();
  }
};
