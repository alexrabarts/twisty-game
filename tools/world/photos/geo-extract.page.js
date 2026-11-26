// Reads photo positions from a Google Photos album in the browser, for the photo-match process.
// Shared albums can hide locations ("People in this album can't see the location of this photo"),
// and downloads then carry no GPS, but the owner's info panel still links to the position.
// Run in a signed-in photos.google.com tab (the owner's account, e.g. /u/1/), on the FIRST photo
// of an album with the info panel open (press i). Paste this, then: geoExtract.start('<album name>')
// and poll geoExtract.status(). When done, geoExtract.csv() returns "file;lat;lng" rows to save as
// ~/Pictures/twisty-reference/geo/<album>.csv. Nothing is written to the account.
window.geoExtract = (() => {
  const rows = [];
  let state = { running: false, done: false, album: null };
  const visible = (e) => e && e.offsetParent !== null && e.getClientRects().length > 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function step() {
    const id = location.pathname.split('/photo/')[1]?.slice(0, 44);
    await wait(700);
    let lat = null, lng = null;
    for (const a of [...document.querySelectorAll('a[href*="/maps?"]')].filter(visible)) {
      const m = decodeURIComponent(a.href).match(/loc:(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) { lat = +m[1]; lng = +m[2]; break; }
    }
    const panels = [...document.querySelectorAll('div')].filter((d) => visible(d) && d.innerText?.startsWith('Info') && d.innerText.includes('Details') && d.innerText.length < 1500);
    const text = panels.length ? panels[panels.length - 1].innerText : '';
    const file = (text.match(/\n([^\n]+\.(jpe?g|heic|png|mp4|mov))\n/i) || [])[1] || '';
    if (!rows.find((r) => r.id === id)) rows.push({ id, file, lat, lng });
    const before = location.pathname;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true }));
    for (let w = 0; w < 40 && location.pathname === before; w++) await wait(100);
    return location.pathname !== before;
  }
  return {
    start(album) { state = { running: true, done: false, album }; (async () => { while (state.running && await step()); state.running = false; state.done = true; })(); return 'started'; },
    stop() { state.running = false; return 'stopping'; },
    status() { return { ...state, items: rows.length, located: rows.filter((r) => r.lat != null).length }; },
    csv() { return ['file;lat;lng', ...rows.filter((r) => r.lat != null && !/\.(mp4|mov)$/i.test(r.file)).map((r) => `${r.file};${r.lat};${r.lng}`)].join('\n'); },
  };
})();
