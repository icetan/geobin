
var geoToDoc = 
exports.geoToDoc = function (geo) {
  if (geo.category !== undefined && typeof geo.category !== 'string')
    throw 'geo.category must be a string';
  if (typeof geo.msg !== 'string')
    throw 'geo.msg must be a string';
  return {
    loc: [geo.lon, geo.lat]
    ,category: geo.category
    ,data: {msg: geo.msg}
  };
}
,docToGeo = 
exports.docToGeo = function (doc) {
  return {
    id: doc._id
    ,lon: doc.loc[0]
    ,lat: doc.loc[1]
    ,msg: doc.data.msg
    ,category: doc.category
    ,date: doc.date
  };
};
