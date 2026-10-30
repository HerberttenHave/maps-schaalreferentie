// Address lookup against PDOK (Dutch national geo services). Used by the popup and the Node test.
// 1. Locatieserver geocodes the address and returns gemeente, wijk and buurt codes.
// 2. The CBS WFS services return the outlines of those three areas.
(function (root) {
  const LOCATIESERVER = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
  const WFS_GEBIEDSINDELINGEN = 'https://service.pdok.nl/cbs/gebiedsindelingen/2024/wfs/v1_0';
  const WFS_WIJKENBUURTEN = 'https://service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0';

  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('PDOK antwoordde ' + r.status + ' op ' + url.split('?')[0]);
    return r.json();
  }

  function wfsUrl(base, typeName, prop, value) {
    const filter = '<Filter xmlns="http://www.opengis.net/fes/2.0"><PropertyIsEqualTo>' +
      '<ValueReference>' + prop + '</ValueReference><Literal>' + value + '</Literal>' +
      '</PropertyIsEqualTo></Filter>';
    const p = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName,
      outputFormat: 'json', srsName: 'EPSG:4326', FILTER: filter,
    });
    return base + '?' + p.toString();
  }

  async function geocode(query) {
    const p = new URLSearchParams({
      q: query, rows: '1', fq: 'type:adres',
      fl: 'weergavenaam,centroide_ll,gemeentecode,gemeentenaam,wijkcode,wijknaam,buurtcode,buurtnaam,provinciecode,provincienaam',
    });
    const data = await getJSON(LOCATIESERVER + '?' + p.toString());
    const doc = data.response && data.response.docs && data.response.docs[0];
    if (!doc) return null;
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll || '');
    return {
      label: doc.weergavenaam,
      lon: m ? +m[1] : null, lat: m ? +m[2] : null,
      gemeentecode: doc.gemeentecode, gemeentenaam: doc.gemeentenaam,
      wijkcode: doc.wijkcode, wijknaam: doc.wijknaam,
      buurtcode: doc.buurtcode, buurtnaam: doc.buurtnaam,
      provinciecode: doc.provinciecode, provincienaam: doc.provincienaam,
    };
  }

  function landGeometries(fc) {
    return (fc.features || []).filter((f) => f.properties.water !== 'JA').map((f) => f.geometry);
  }

  // Returns the three areas as reference objects (without ids/markers; the caller adds those).
  async function fetchAreas(geo, geoHelpers) {
    const jobs = [];
    if (geo.gemeentecode) jobs.push(getJSON(wfsUrl(WFS_GEBIEDSINDELINGEN, 'gebiedsindelingen:gemeente_gegeneraliseerd', 'statcode', 'GM' + geo.gemeentecode))
      .then((fc) => ({ key: 'gemeente', name: geo.gemeentenaam, fc, src: 'CBS Gebiedsindelingen 2024 (PDOK)' })));
    if (geo.wijkcode) jobs.push(getJSON(wfsUrl(WFS_WIJKENBUURTEN, 'wijkenbuurten:wijken', 'wijkcode', geo.wijkcode))
      .then((fc) => ({ key: 'wijk', name: (geo.wijknaam || '').replace(/^Wijk \d+ /, ''), fc, src: 'CBS Wijk- en buurtkaart 2024, wijk ' + geo.wijkcode + ' (PDOK)' })));
    if (geo.buurtcode) jobs.push(getJSON(wfsUrl(WFS_WIJKENBUURTEN, 'wijkenbuurten:buurten', 'buurtcode', geo.buurtcode))
      .then((fc) => ({ key: 'buurt', name: geo.buurtnaam, fc, src: 'CBS Wijk- en buurtkaart 2024, buurt ' + geo.buurtcode + ' (PDOK)' })));
    const results = await Promise.all(jobs);
    const areas = [];
    for (const r of results) {
      const loc = geoHelpers.projectGeometries(landGeometries(r.fc));
      if (!loc) continue;
      areas.push({ id: 'adres-' + r.key, name: r.name || r.key, kind: r.key, source: r.src, ...loc });
    }
    return areas;
  }

  const api = { geocode, fetchAreas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MSR_PDOK = api;
})(typeof window !== 'undefined' ? window : globalThis);
