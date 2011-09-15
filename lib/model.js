
var geoToDoc = 
exports.geoToDoc = function (geo) {
  return {
    loc: geo.geometry.coordinates
    ,data: geo.properties.meta
  };
}
,docToGeo = 
exports.docToGeo = function (doc) {
  return {
    id: doc._id
    ,geometry: {
      type: 'Point'
      ,coordinates: doc.loc
    }
    ,properties: {
      meta: doc.data
      ,date: doc.date
    }
  };
};
